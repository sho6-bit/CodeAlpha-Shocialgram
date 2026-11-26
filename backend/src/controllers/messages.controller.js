import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { parseBigIntId } from "../utils/parse-bigint-id.js";
import { toJsonSafe, toPublicUser } from "../utils/response-serialization.js";

const messageUserSelect = {
  id: true,
  username: true,
  fullName: true,
  profilePicture: true,
};

const messageRelations = {
  users_messages_sender_idTousers: { select: messageUserSelect },
  users_messages_receiver_idTousers: { select: messageUserSelect },
};

function serializeMessage(message) {
  return {
    id: message.id.toString(),
    senderId: message.sender_id.toString(),
    receiverId: message.receiver_id.toString(),
    content: message.content,
    isRead: message.is_read,
    createdAt: message.created_at,
    sender: toPublicUser(message.users_messages_sender_idTousers),
    receiver: toPublicUser(message.users_messages_receiver_idTousers),
  };
}

function createPostUrl(request, postId) {
  const origin = request.get("origin") || env.clientOrigin;
  let baseUrl;
  try {
    baseUrl = new URL(origin);
  } catch {
    throw new AppError(400, "A valid share origin is required");
  }
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new AppError(400, "A valid share origin is required");
  }
  const allowedOrigins = new Set([env.clientOrigin, `${request.protocol}://${request.get("host")}`]
    .map((value) => new URL(value).origin));
  if (!allowedOrigins.has(baseUrl.origin)) {
    throw new AppError(400, "Share origin is not allowed");
  }
  const postUrl = new URL("/", baseUrl.origin);
  postUrl.searchParams.set("post", postId.toString());
  return postUrl.toString();
}

export async function sharePost(request, response) {
  const postId = parseBigIntId(request.body?.postId, "post ID");
  const receiverId = parseBigIntId(request.body?.receiverId, "recipient ID");
  if (receiverId === request.userId) throw new AppError(400, "You cannot share a post with yourself");

  const [recipient, post] = await Promise.all([
    prisma.user.findUnique({ where: { id: receiverId }, select: { id: true } }),
    prisma.post.findUnique({ where: { id: postId }, select: { id: true } }),
  ]);
  if (!recipient) throw new AppError(404, "Recipient not found");
  if (!post) throw new AppError(404, "Post not found");

  const url = createPostUrl(request, post.id);
  const message = await prisma.messages.create({
    data: {
      sender_id: request.userId,
      receiver_id: recipient.id,
      content: `Shared a post: ${url}`,
    },
  });
  response.status(201).json({ message: toJsonSafe(message) });
}

export async function getConversations(request, response) {
  const messages = await prisma.messages.findMany({
    where: {
      OR: [
        { sender_id: request.userId },
        { receiver_id: request.userId },
      ],
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    include: messageRelations,
  });

  const conversations = new Map();
  for (const message of messages) {
    const isSender = message.sender_id === request.userId;
    const otherId = isSender ? message.receiver_id : message.sender_id;
    const key = otherId.toString();
    let conversation = conversations.get(key);
    if (!conversation) {
      const otherUser = isSender
        ? message.users_messages_receiver_idTousers
        : message.users_messages_sender_idTousers;
      conversation = {
        user: toPublicUser(otherUser),
        lastMessage: serializeMessage(message),
        unreadCount: 0,
      };
      conversations.set(key, conversation);
    }
    if (message.receiver_id === request.userId && !message.is_read) {
      conversation.unreadCount += 1;
    }
  }

  const result = [...conversations.values()];
  response.json({
    conversations: result,
    unreadCount: result.reduce((count, conversation) => count + conversation.unreadCount, 0),
  });
}

export async function getConversation(request, response) {
  const otherUserId = parseBigIntId(request.params.userId, "user ID");
  if (otherUserId === request.userId) throw new AppError(400, "You cannot message yourself");

  const user = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: messageUserSelect,
  });
  if (!user) throw new AppError(404, "User not found");

  await prisma.messages.updateMany({
    where: {
      sender_id: otherUserId,
      receiver_id: request.userId,
      is_read: false,
    },
    data: { is_read: true },
  });
  const messages = await prisma.messages.findMany({
    where: {
      OR: [
        { sender_id: request.userId, receiver_id: otherUserId },
        { sender_id: otherUserId, receiver_id: request.userId },
      ],
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    include: messageRelations,
  });

  response.json({
    user: toPublicUser(user),
    messages: messages.reverse().map(serializeMessage),
  });
}

export async function sendMessage(request, response) {
  const receiverId = parseBigIntId(request.body?.receiverId, "recipient ID");
  if (receiverId === request.userId) throw new AppError(400, "You cannot message yourself");
  if (typeof request.body?.content !== "string") {
    throw new AppError(400, "Message content is required");
  }
  const content = request.body.content.trim();
  if (!content || content.length > 2200) {
    throw new AppError(400, "Message must be between 1 and 2200 characters");
  }

  const recipient = await prisma.user.findUnique({
    where: { id: receiverId },
    select: messageUserSelect,
  });
  if (!recipient) throw new AppError(404, "Recipient not found");

  const message = await prisma.messages.create({
    data: {
      sender_id: request.userId,
      receiver_id: recipient.id,
      content,
    },
    include: messageRelations,
  });
  response.status(201).json({ message: serializeMessage(message) });
}
