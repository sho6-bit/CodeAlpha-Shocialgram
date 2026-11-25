import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { configureTestEnvironment, responseStub } from "./test-helpers.js";

configureTestEnvironment();

const [{ createPost }, { prisma }, { removeImage }, { errorHandler }] = await Promise.all([
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

test("foreign-key failures return a conflict instead of an internal server error", () => {
  const response = responseStub();
  errorHandler(Object.assign(new Error("Foreign key failed"), { code: "P2003" }), {}, response, () => {});
  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /related database record/i);
});
