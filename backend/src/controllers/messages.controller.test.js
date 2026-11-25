import assert from "node:assert/strict";
import { test } from "node:test";
import { configureTestEnvironment, responseStub } from "./test-helpers.js";

configureTestEnvironment();

const [{ sharePost }, { prisma }] = await Promise.all([
  import("./messages.controller.js"),
  import("../config/prisma.js"),
]);

test("sharePost stores a post URL as a message for the authenticated sender", async (t) => {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalPostFindUnique = prisma.post.findUnique;
  const originalMessageCreate = prisma.messages.create;
  t.after(() => {
    prisma.user.findUnique = originalUserFindUnique;
    prisma.post.findUnique = originalPostFindUnique;
    prisma.messages.create = originalMessageCreate;
  });

  const lookups = [];
  let createdMessage;
  prisma.user.findUnique = async (args) => {
    lookups.push(args.where.id);
    return { id: args.where.id };
  };
  prisma.post.findUnique = async (args) => ({ id: args.where.id });
  prisma.messages.create = async ({ data }) => {
    createdMessage = data;
    return { id: 501n, ...data, created_at: new Date("2026-01-01T00:00:00.000Z") };
  };

  const response = responseStub();
  await sharePost({
    userId: 42n,
    body: { postId: "123", receiverId: "84" },
    protocol: "https",
    get: (name) => name === "origin" ? "https://shocialgram.example" : name === "host" ? "shocialgram.example" : undefined,
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(createdMessage.sender_id, 42n);
  assert.equal(createdMessage.receiver_id, 84n);
  assert.equal(createdMessage.content, "Shared a post: https://shocialgram.example/?post=123");
  assert.deepEqual(lookups, [84n]);
  assert.equal(response.body.message.id, "501");
});

test("sharePost rejects self-sharing and invalid IDs before creating a message", async (t) => {
  const originalCreate = prisma.messages.create;
  let createCalled = false;
  prisma.messages.create = async () => {
    createCalled = true;
  };
  t.after(() => {
    prisma.messages.create = originalCreate;
  });

  await assert.rejects(
    sharePost({ userId: 42n, body: { postId: "123", receiverId: "42" } }, responseStub()),
    (error) => error.status === 400,
  );
  await assert.rejects(
    sharePost({ userId: 42n, body: { postId: "bad", receiverId: "84" } }, responseStub()),
    (error) => error.status === 400,
  );
  assert.equal(createCalled, false);
});
