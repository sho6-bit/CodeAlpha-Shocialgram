import { prisma } from "../config/prisma.js";
import { toJsonSafe, toPublicUser } from "../utils/response-serialization.js";

const senderSelect = { id: true, username: true, fullName: true, profilePicture: true };

function serializeNotification(notification) {
  return toJsonSafe({
    id: notification.id,
    type: notification.type,
    postId: notification.post_id,
    commentId: notification.comment_id,
    isRead: notification.is_read,
    createdAt: notification.created_at,
    sender: toPublicUser(notification.users_notifications_sender_idTousers),
  });
}

export async function getNotifications(request, response) {
  const notifications = await prisma.notifications.findMany({
    where: { recipient_id: request.userId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 60,
    include: { users_notifications_sender_idTousers: { select: senderSelect } },
  });
  response.json({
    notifications: notifications.map(serializeNotification),
    unreadCount: notifications.filter((notification) => !notification.is_read).length,
  });
}

export async function markNotificationsRead(request, response) {
  await prisma.notifications.updateMany({
    where: { recipient_id: request.userId, is_read: false },
    data: { is_read: true },
  });
  response.status(204).end();
}
