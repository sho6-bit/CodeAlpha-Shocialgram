import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { parseBigIntId } from "../utils/parse-bigint-id.js";
import { toJsonSafe } from "../utils/response-serialization.js";

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
