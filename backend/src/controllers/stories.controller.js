import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/app-error.js";
import { removeImage, saveStoryMedia } from "../utils/image-storage.js";
import { parseBigIntId } from "../utils/parse-bigint-id.js";
import { toJsonSafe } from "../utils/response-serialization.js";

const userSelect = { id: true, username: true, fullName: true, profilePicture: true };
const activeStoryWhere = { expires_at: { gt: new Date() } };

function serializeStory(story, viewerId) {
  return toJsonSafe({
    ...story,
    viewed: Boolean(viewerId && story.views?.length),
    views: undefined,
  });
}

export async function getStoryFeed(request, response) {
  const stories = await prisma.stories.findMany({
    where: { ...activeStoryWhere, OR: [{ user_id: request.userId }, { users: { followers: { some: { followerId: request.userId } } } }] },
    orderBy: [{ user_id: "asc" }, { created_at: "asc" }],
    include: { users: { select: userSelect }, views: { where: { user_id: request.userId }, select: { user_id: true } } },
  });
  const groups = new Map();
  for (const story of stories) {
    const key = story.user_id.toString();
    if (!groups.has(key)) groups.set(key, { user: story.users, stories: [], hasUnseen: false });
    const group = groups.get(key);
    const item = serializeStory(story, request.userId);
    group.stories.push(item);
    if (!item.viewed) group.hasUnseen = true;
  }
  response.json(toJsonSafe({ storyGroups: [...groups.values()].sort((a, b) => Number(b.hasUnseen) - Number(a.hasUnseen)) }));
}

export async function createStory(request, response) {
  const caption = String(request.body?.caption ?? "").trim();
  if (caption.length > 2200) throw new AppError(400, "Caption must be 2200 characters or fewer");
  const media = await saveStoryMedia(request.file);
  try {
    const story = await prisma.stories.create({
      data: { user_id: request.userId, media_url: media.mediaUrl, media_type: media.mediaType, caption },
      include: { users: { select: userSelect } },
    });
    response.status(201).json({ story: serializeStory(story, request.userId) });
  } catch (error) {
    await removeImage(media.mediaUrl);
    throw error;
  }
}

async function findActiveStory(id) {
  const story = await prisma.stories.findFirst({ where: { id, ...activeStoryWhere } });
  if (!story) throw new AppError(404, "Story not found or has expired");
  return story;
}

export async function recordStoryView(request, response) {
  const story = await findActiveStory(parseBigIntId(request.params.id, "story ID"));
  await prisma.story_views.upsert({
    where: { story_id_user_id: { story_id: story.id, user_id: request.userId } },
    update: {}, create: { story_id: story.id, user_id: request.userId },
  });
  response.status(204).end();
}

export async function toggleStoryReaction(request, response) {
  const reaction = String(request.body?.reaction ?? "").trim();
  if (!reaction || reaction.length > 32) throw new AppError(400, "Choose a valid reaction");
  const story = await findActiveStory(parseBigIntId(request.params.id, "story ID"));
  const key = { story_id_user_id_reaction: { story_id: story.id, user_id: request.userId, reaction } };
  const existing = await prisma.story_reactions.findUnique({ where: key });
  if (existing) await prisma.story_reactions.delete({ where: key });
  else await prisma.story_reactions.create({ data: { story_id: story.id, user_id: request.userId, reaction } });
  response.json({ reacted: !existing });
}

export async function replyToStory(request, response) {
  const content = String(request.body?.content ?? "").trim();
  if (!content || content.length > 2200) throw new AppError(400, "Reply must be between 1 and 2200 characters");
  const story = await findActiveStory(parseBigIntId(request.params.id, "story ID"));
  const reply = await prisma.story_replies.create({ data: { story_id: story.id, user_id: request.userId, content } });
  response.status(201).json({ reply: toJsonSafe(reply) });
}

export async function deleteStory(request, response) {
  const id = parseBigIntId(request.params.id, "story ID");
  const result = await prisma.stories.deleteMany({ where: { id, user_id: request.userId } });
  if (!result.count) {
    const exists = await prisma.stories.findUnique({ where: { id }, select: { id: true } });
    throw new AppError(exists ? 403 : 404, exists ? "You cannot delete this story" : "Story not found");
  }
  response.status(204).end();
}
