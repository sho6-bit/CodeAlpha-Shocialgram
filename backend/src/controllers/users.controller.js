import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { removeImage, saveImage } from "../utils/image-storage.js";
import { parseBigIntId } from "../utils/parse-bigint-id.js";
import { toJsonSafe, toPublicUser } from "../utils/response-serialization.js";

export async function getProfile(request, response) {
  const user = await prisma.user.findUnique({
    where: { username: request.params.username.toLowerCase() },
    include: {
      _count: { select: { posts: true, followers: true, following: true } },
      posts: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { likes: true, comments: true } } },
      },
    },
  });
  if (!user) throw new AppError(404, "User not found");

  const isFollowing = request.userId
    ? Boolean(await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: request.userId,
            followingId: user.id,
          },
        },
      }))
    : false;

  response.json({
    user: toPublicUser(user),
    counts: user._count,
    isFollowing,
    posts: toJsonSafe(user.posts),
  });
}

export async function searchUsers(request, response) {
  const query = String(request.query.q ?? "").trim().toLowerCase();
  if (query.length < 2) return response.json({ users: [] });
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: query, mode: "insensitive" } },
        { fullName: { contains: query, mode: "insensitive" } },
      ],
      ...(request.userId ? { id: { not: request.userId } } : {}),
    },
    take: 20,
    orderBy: { username: "asc" },
    include: { _count: { select: { followers: true, posts: true } } },
  });
  response.json({ users: users.map((user) => ({ ...toPublicUser(user), counts: user._count })) });
}

export async function updateProfile(request, response) {
  const fullName = String(request.body.fullName ?? "").trim();
  const bio = String(request.body.bio ?? "").trim();
  const username = String(request.body.username ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._]{3,30}$/.test(username)) {
    throw new AppError(400, "Username must be 3-30 characters (letters, numbers, dots, underscores)");
  }
  if (!fullName || fullName.length > 80) throw new AppError(400, "Enter a name of 1-80 characters");
  if (bio.length > 500) throw new AppError(400, "Bio must be 500 characters or fewer");

  const user = await prisma.user.update({
    where: { id: request.userId },
    data: { username, fullName, bio },
  });
  response.json({ user: toPublicUser(user) });
}

export async function updateAvatar(request, response) {
  const imageUrl = await saveImage(request.file);
  const previous = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { profilePicture: true },
  });
  let user;
  try {
    user = await prisma.user.update({
      where: { id: request.userId },
      data: { profilePicture: imageUrl },
    });
  } catch (error) {
    await removeImage(imageUrl);
    throw error;
  }
  await removeImage(previous?.profilePicture);
  response.json({ user: toPublicUser(user) });
}

export async function toggleFollow(request, response) {
  const targetId = parseBigIntId(request.params.id, "user ID");
  if (targetId === request.userId) throw new AppError(400, "You cannot follow yourself");
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) throw new AppError(404, "User not found");

  const relation = {
    followerId_followingId: { followerId: request.userId, followingId: targetId },
  };
  const existing = await prisma.follow.findUnique({ where: relation });
  if (existing) {
    await prisma.follow.delete({ where: relation });
  } else {
    await prisma.follow.create({ data: { followerId: request.userId, followingId: targetId } });
  }
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: targetId } }),
    prisma.follow.count({ where: { followerId: targetId } }),
  ]);
  response.json({ following: !existing, followersCount, followingCount });
}

export async function getConnections(request, response) {
  const username = request.params.username.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) throw new AppError(404, "User not found");
  const direction = request.params.kind === "followers" ? "followers" : "following";
  const relations = await prisma.follow.findMany({
    where: direction === "followers" ? { followingId: user.id } : { followerId: user.id },
    include: {
      [direction === "followers" ? "follower" : "following"]: {
        include: { _count: { select: { followers: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const key = direction === "followers" ? "follower" : "following";
  const connectedUsers = relations.map(({ [key]: connectedUser }) => connectedUser);
  const followingIds = request.userId && connectedUsers.length
    ? new Set((await prisma.follow.findMany({
        where: {
          followerId: request.userId,
          followingId: { in: connectedUsers.map(({ id }) => id) },
        },
        select: { followingId: true },
      })).map(({ followingId }) => followingId.toString()))
    : new Set();
  response.json({
    users: connectedUsers.map((connectedUser) => ({
      ...toPublicUser(connectedUser),
      followersCount: connectedUser._count.followers,
      isFollowing: followingIds.has(connectedUser.id.toString()),
    })),
  });
}
