import { authFetch } from "./api";

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  link: string | null;
  actor_count: number;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPage {
  items: AppNotification[];
  next_cursor: string | null;
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  list_liked: "پسندیده‌شدن لیست‌های من",
  list_commented: "نظر روی لیست‌های من",
  comment_replied: "پاسخ به نظرهای من",
  list_followed: "دنبال‌شدن لیست‌های من",
  list_featured: "انتخاب لیست من به‌عنوان ویژه",
};

export const fetchNotifications = (token: string, cursor?: string | null, limit = 20) => {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  return authFetch<NotificationPage>(`/notifications?${qs.toString()}`, token);
};

export const fetchUnreadCount = (token: string) =>
  authFetch<{ count: number }>("/notifications/unread-count", token).then((d) => d.count);

export const markNotificationRead = (token: string, id: string) =>
  authFetch<{ read: boolean }>(`/notifications/${id}/read`, token, { method: "POST" });

export const markAllNotificationsRead = (token: string) =>
  authFetch<{ updated: number }>("/notifications/read-all", token, { method: "POST" });

export const deleteNotification = (token: string, id: string) =>
  authFetch<{ deleted: boolean }>(`/notifications/${id}`, token, { method: "DELETE" });

export const fetchNotificationPreferences = (token: string) =>
  authFetch<Record<string, boolean>>("/notifications/preferences", token);

export const updateNotificationPreferences = (token: string, preferences: Record<string, boolean>) =>
  authFetch<Record<string, boolean>>("/notifications/preferences", token, { method: "PUT", body: { preferences } });
