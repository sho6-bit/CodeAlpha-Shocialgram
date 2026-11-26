import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { removeImage, saveImage } from "../utils/image-storage.js";
import { parseBigIntId } from "../utils/parse-bigint-id.js";
import { toJsonSafe } from "../utils/response-serialization.js";

const postInclude = {
  user: { select: { id: true, username: true, fullName: true, profilePicture: true } },
  _count: { select: { likes: true, comments: true } },
};

function serializePost(post, viewerId) {
  const liked = viewerId
    ? post.likes?.some((like) => like.userId === viewerId) ?? false
    : false;
  const { likes, ...postData } = post;
  return toJsonSafe({ ...postData, liked });
}

export async function getFeed(request, response) {
  const follows = await prisma.follow.findMany({
    where: { followerId: request.userId },
    select: { followingId: true },
  });
  const posts = await prisma.post.findMany({
    where: { userId: { in: follows.map(({ followingId }) => followingId) } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { ...postInclude, likes: { where: { userId: request.userId }, select: { userId: true } } },
  });
  response.json({ posts: posts.map((post) => serializePost(post, request.userId)) });
}

export async function getExplore(request, response) {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      ...postInclude,
      ...(request.userId
        ? { likes: { where: { userId: request.userId }, select: { userId: true } } }
        : {}),
    },
  });
  response.json({ posts: posts.map((post) => serializePost(post, request.userId)) });
}

export async function getPost(request, response) {
  const post = await prisma.post.findUnique({
    where: { id: parseBigIntId(request.params.id, "post ID") },
    include: {
      ...postInclude,
      ...(request.userId
        ? { likes: { where: { userId: request.userId }, select: { userId: true } } }
        : {}),
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, username: true, profilePicture: true } } },
      },
    },
  });
  if (!post) throw new AppError(404, "Post not found");
  response.json({ post: serializePost(post, request.userId) });
}

export async function createPost(request, response) {
  const caption = String(request.body?.caption ?? "").trim();
  if (caption.length > 2200) throw new AppError(400, "Caption must be 2200 characters or fewer");
  const imageUrl = await saveImage(request.file);
  let post;
  try {
    post = await prisma.post.create({
      data: { userId: request.userId, imageUrl, caption },
      include: postInclude,
    });
  } catch (error) {
    await removeImage(imageUrl);
    throw error;
  }
  response.status(201).json({ post: serializePost(post, request.userId) });
}

export async function updatePost(request, response) {
  const postId = parseBigIntId(request.params.id, "post ID");
  const caption = String(request.body.caption ?? "").trim();
  if (caption.length > 2200) throw new AppError(400, "Caption must be 2200 characters or fewer");
  const result = await prisma.post.updateMany({
    where: { id: postId, userId: request.userId },
    data: { caption },
  });
  if (result.count === 0) {
    const exists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    throw new AppError(exists ? 403 : 404, exists ? "You cannot edit this post" : "Post not found");
  }
  const post = await prisma.post.findUnique({ where: { id: postId }, include: postInclude });
  response.json({ post: serializePost(post, request.userId) });
}

export async function deletePost(request, response) {
  const postId = parseBigIntId(request.params.id, "post ID");
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, "Post not found");
  if (post.userId !== request.userId) throw new AppError(403, "You cannot delete this post");
  await prisma.post.delete({ where: { id: post.id } });
  await removeImage(post.imageUrl);
  response.status(204).end();
}

export async function toggleLike(request, response) {
  const postId = parseBigIntId(request.params.id, "post ID");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, userId: true },
  });
  if (!post) throw new AppError(404, "Post not found");
  const relation = {
    userId_postId: { userId: request.userId, postId: post.id },
  };
  const existing = await prisma.like.findUnique({ where: relation });
  if (existing) {
    await prisma.like.delete({ where: relation });
  } else {
    await prisma.like.create({ data: { postId: post.id, userId: request.userId } });
    if (post.userId !== request.userId) {
      await prisma.notifications.create({
        data: { recipient_id: post.userId, sender_id: request.userId, type: "like", post_id: post.id },
      });
    }
  }
  const likesCount = await prisma.like.count({ where: { postId: post.id } });
  response.json({ liked: !existing, likesCount });
}

export async function addComment(request, response) {
  const content = String(request.body.content ?? "").trim();
  if (!content || content.length > 2200) {
    throw new AppError(400, "Comment must be between 1 and 2200 characters");
  }
  const postId = parseBigIntId(request.params.id, "post ID");
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, userId: true } });
  if (!post) throw new AppError(404, "Post not found");
  const comment = await prisma.comment.create({
    data: { postId: post.id, userId: request.userId, content },
    include: { user: { select: { id: true, username: true, profilePicture: true } } },
  });
  if (post.userId !== request.userId) {
    await prisma.notifications.create({
      data: { recipient_id: post.userId, sender_id: request.userId, type: "comment", post_id: post.id, comment_id: comment.id },
    });
  }
  response.status(201).json({ comment: toJsonSafe(comment) });
}

export async function deleteComment(request, response) {
  const commentId = parseBigIntId(request.params.commentId, "comment ID");
  const result = await prisma.comment.deleteMany({
    where: { id: commentId, userId: request.userId },
  });
  if (result.count === 0) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    });
    throw new AppError(comment ? 403 : 404, comment ? "You cannot delete this comment" : "Comment not found");
  }
  response.status(204).end();
}
