import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { configureTestEnvironment, responseStub } from "./test-helpers.js";

configureTestEnvironment();

const [{ createPost, updatePost, deletePost }, { prisma }, { removeImage }, { errorHandler }] = await Promise.all([
  import("./posts.controller.js"),
  import("../config/prisma.js"),
  import("../utils/image-storage.js"),
  import("../middleware/error-handler.js"),
]);

const uploadsDirectory = fileURLToPath(new URL("../../uploads/", import.meta.url));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r1sAAAAASUVORK5CYII=",
  "base64",
);

test("createPost stores a JWT-owned image post and returns JSON-safe IDs", async (t) => {
  const originalCreate = prisma.post.create;
  t.after(() => {
    prisma.post.create = originalCreate;
  });

  let createArgs;
  prisma.post.create = async (args) => {
    createArgs = args;
    return {
      id: 501n,
      ...args.data,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      user: { id: 42n, username: "test-user", fullName: null, profilePicture: null },
      _count: { likes: 0, comments: 0 },
    };
  };

  const response = responseStub();
  await createPost(
    {
      userId: 42n,
      body: { userId: "999", caption: "" },
      file: { buffer: png, mimetype: "image/png" },
    },
    response,
  );

  const imageUrl = createArgs.data.imageUrl;
  try {
    assert.equal(response.statusCode, 201);
    assert.equal(createArgs.data.userId, 42n);
    assert.equal(createArgs.data.caption, "");
    assert.match(imageUrl, /^\/uploads\/[\da-f-]+\.png$/i);
    assert.equal(response.body.post.id, "501");
    assert.equal(response.body.post.userId, "42");
    assert.equal(response.body.post.user.id, "42");
    assert.equal(response.body.post.liked, false);
    assert.deepEqual(await readFile(`${uploadsDirectory}\\${imageUrl.split("/").pop()}`), png);
  } finally {
    await removeImage(imageUrl);
  }
});

test("createPost rejects missing images before writing to the database", async (t) => {
  const originalCreate = prisma.post.create;
  let createCalled = false;
  prisma.post.create = async () => {
    createCalled = true;
  };
  t.after(() => {
    prisma.post.create = originalCreate;
  });

  await assert.rejects(
    createPost({ userId: 42n, body: {}, file: undefined }, responseStub()),
    (error) => error.status === 400,
  );
  assert.equal(createCalled, false);
});

test("createPost rejects a non-image file before writing to the database", async (t) => {
  const originalCreate = prisma.post.create;
  let createCalled = false;
  prisma.post.create = async () => {
    createCalled = true;
  };
  t.after(() => {
    prisma.post.create = originalCreate;
  });

  await assert.rejects(
    createPost(
      { userId: 42n, body: {}, file: { buffer: Buffer.from("not an image"), mimetype: "image/png" } },
      responseStub(),
    ),
    (error) => error.status === 400,
  );
  assert.equal(createCalled, false);
});

test("createPost removes a saved image if the database insert fails", async (t) => {
  const originalCreate = prisma.post.create;
  let attemptedImageUrl;
  const databaseError = new Error("Database insert failed");
  prisma.post.create = async ({ data }) => {
    attemptedImageUrl = data.imageUrl;
    throw databaseError;
  };
  t.after(() => {
    prisma.post.create = originalCreate;
  });

  await assert.rejects(
    createPost(
      { userId: 42n, body: {}, file: { buffer: png, mimetype: "image/png" } },
      responseStub(),
    ),
    (error) => error === databaseError,
  );
  await assert.rejects(
    access(`${uploadsDirectory}\\${attemptedImageUrl.split("/").pop()}`),
    (error) => error.code === "ENOENT",
  );
});

test("updatePost changes the existing caption only for its owner", async (t) => {
  const originalUpdateMany = prisma.post.updateMany;
  const originalFindUnique = prisma.post.findUnique;
  t.after(() => {
    prisma.post.updateMany = originalUpdateMany;
    prisma.post.findUnique = originalFindUnique;
  });

  let updateArgs;
  prisma.post.updateMany = async (args) => {
    updateArgs = args;
    return { count: 1 };
  };
  prisma.post.findUnique = async () => ({
    id: 501n,
    userId: 42n,
    caption: "Updated caption",
    imageUrl: "/uploads/unchanged.png",
    user: { id: 42n, username: "test-user" },
    _count: { likes: 0, comments: 0 },
  });

  const response = responseStub();
  await updatePost({ userId: 42n, params: { id: "501" }, body: { caption: " Updated caption " } }, response);
  assert.deepEqual(updateArgs.where, { id: 501n, userId: 42n });
  assert.deepEqual(updateArgs.data, { caption: "Updated caption" });
  assert.equal(response.body.post.id, "501");
  assert.equal(response.body.post.imageUrl, "/uploads/unchanged.png");
});

test("updatePost and deletePost reject posts owned by another user", async (t) => {
  const originalUpdateMany = prisma.post.updateMany;
  const originalFindUnique = prisma.post.findUnique;
  const originalDelete = prisma.post.delete;
  t.after(() => {
    prisma.post.updateMany = originalUpdateMany;
    prisma.post.findUnique = originalFindUnique;
    prisma.post.delete = originalDelete;
  });

  let deleteCalled = false;
  prisma.post.updateMany = async () => ({ count: 0 });
  prisma.post.findUnique = async () => ({ id: 501n, userId: 99n });
  prisma.post.delete = async () => {
    deleteCalled = true;
  };

  await assert.rejects(
    updatePost({ userId: 42n, params: { id: "501" }, body: { caption: "Not mine" } }, responseStub()),
    (error) => error.status === 403,
  );
  await assert.rejects(
    deletePost({ userId: 42n, params: { id: "501" } }, responseStub()),
    (error) => error.status === 403,
  );
  assert.equal(deleteCalled, false);
});

test("foreign-key failures return a conflict instead of an internal server error", () => {
  const response = responseStub();
  errorHandler(Object.assign(new Error("Foreign key failed"), { code: "P2003" }), {}, response, () => {});
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /related database record/i);
});
