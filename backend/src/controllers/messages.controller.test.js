import assert from "node:assert/strict";
import { test } from "node:test";
import { configureTestEnvironment, responseStub } from "./test-helpers.js";

configureTestEnvironment();

const [{ getConversation, getConversations, sendMessage, sharePost }, { prisma }] = await Promise.all([
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

test("getConversations only returns chats involving the authenticated user", async (t) => {
  const originalFindMany = prisma.messages.findMany;
  t.after(() => {
    prisma.messages.findMany = originalFindMany;
  });

  const sender = { id: 42n, username: "current-user", fullName: null, profilePicture: null };
  const firstPeer = { id: 84n, username: "first-peer", fullName: "First Peer", profilePicture: null };
  const secondPeer = { id: 99n, username: "second-peer", fullName: "Second Peer", profilePicture: null };
  const messageRow = (id, senderId, receiverId, content, isRead) => ({
    id: BigInt(id),
    sender_id: BigInt(senderId),
    receiver_id: BigInt(receiverId),
    content,
    is_read: isRead,
    created_at: new Date(`2026-01-0${id}T00:00:00.000Z`),
    users_messages_sender_idTousers: senderId === "42" ? sender : senderId === "84" ? firstPeer : secondPeer,
    users_messages_receiver_idTousers: receiverId === "42" ? sender : receiverId === "84" ? firstPeer : secondPeer,
  });
  let query;
  prisma.messages.findMany = async (args) => {
    query = args;
    return [
      messageRow("3", "42", "84", "Latest with first peer", true),
      messageRow("2", "84", "42", "Unread from first peer", false),
      messageRow("1", "99", "42", "Unread from second peer", false),
    ];
  };

  const response = responseStub();
  await getConversations({ userId: 42n }, response);
  assert.deepEqual(query.where, { OR: [{ sender_id: 42n }, { receiver_id: 42n }] });
  assert.deepEqual(response.body.conversations.map(({ user, lastMessage, unreadCount }) => [
    user.id, lastMessage.content, unreadCount,
  ]), [
    ["84", "Latest with first peer", 1],
    ["99", "Unread from second peer", 1],
  ]);
  assert.equal(response.body.unreadCount, 2);
});

test("getConversation marks only incoming messages read and returns chronological history", async (t) => {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalUpdateMany = prisma.messages.updateMany;
  const originalFindMany = prisma.messages.findMany;
  t.after(() => {
    prisma.user.findUnique = originalUserFindUnique;
    prisma.messages.updateMany = originalUpdateMany;
    prisma.messages.findMany = originalFindMany;
  });

  prisma.user.findUnique = async () => ({ id: 84n, username: "peer", fullName: null, profilePicture: null });
  let readFilter;
  let historyFilter;
  prisma.messages.updateMany = async (args) => {
    readFilter = args.where;
    return { count: 1 };
  };
  const sender = { id: 84n, username: "peer", fullName: null, profilePicture: null };
  const receiver = { id: 42n, username: "current", fullName: null, profilePicture: null };
  const row = (id, senderId, receiverId, content) => ({
    id: BigInt(id),
    sender_id: BigInt(senderId),
    receiver_id: BigInt(receiverId),
    content,
    is_read: true,
    created_at: new Date(`2026-01-0${id}T00:00:00.000Z`),
    users_messages_sender_idTousers: senderId === "84" ? sender : receiver,
    users_messages_receiver_idTousers: receiverId === "42" ? receiver : sender,
  });
  prisma.messages.findMany = async (args) => {
    historyFilter = args.where;
    return [row("2", "42", "84", "Second"), row("1", "84", "42", "First")];
  };

  const response = responseStub();
  await getConversation({ userId: 42n, params: { userId: "84" } }, response);
  assert.deepEqual(readFilter, { sender_id: 84n, receiver_id: 42n, is_read: false });
  assert.deepEqual(historyFilter, {
    OR: [
      { sender_id: 42n, receiver_id: 84n },
      { sender_id: 84n, receiver_id: 42n },
    ],
  });
  assert.deepEqual(response.body.messages.map(({ content }) => content), ["First", "Second"]);
  assert.equal(response.body.user.id, "84");
});

test("sendMessage rejects empty content and stores valid messages for another user", async (t) => {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalCreate = prisma.messages.create;
  t.after(() => {
    prisma.user.findUnique = originalUserFindUnique;
    prisma.messages.create = originalCreate;
  });

  let createdData;
  prisma.user.findUnique = async ({ where }) => ({ id: where.id, username: "recipient", fullName: null, profilePicture: null });
  prisma.messages.create = async ({ data, include }) => {
    createdData = data;
    assert.ok(include.users_messages_sender_idTousers);
    return {
      id: 501n,
      ...data,
      is_read: false,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      users_messages_sender_idTousers: { id: 42n, username: "sender" },
      users_messages_receiver_idTousers: { id: 84n, username: "recipient" },
    };
  };

  await assert.rejects(
    sendMessage({ userId: 42n, body: { receiverId: "84", content: "  " } }, responseStub()),
    (error) => error.status === 400,
  );
  const response = responseStub();
  await sendMessage({ userId: 42n, body: { receiverId: "84", content: "  Hello  " } }, response);
  assert.deepEqual(createdData, { sender_id: 42n, receiver_id: 84n, content: "Hello" });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.message.senderId, "42");
  assert.equal(response.body.message.receiverId, "84");
});
