'use server';

import {
  NOTIFICATIONS_PAGE,
  type IsoDateTime,
  type NotificationChannel,
  type NotificationItem,
  type NotificationPreferences,
  type NotificationRetention,
  type NotificationSettings,
  type NotificationsReadAll,
  type NotificationUnreadCount,
  type Uuid,
} from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/*
 * The bell, My account → Notifications and Settings → Notifications (spec → API (contract)). Every
 * read is the signed-in person's own and changes from one minute to the next, so nothing is cached
 * (`no-store`) and there is no tag for a write to revalidate.
 */

const path = (id: Uuid) => encodeURIComponent(id);

export interface NotificationsQuery {
  page?: number;
  limit?: number;
  status?: 'all' | 'unread';
}

/** `GET /notifications` — newest first, 20 a page; `meta.total` is how many there are in all. */
export async function GET_NOTIFICATIONS(query: NotificationsQuery = {}) {
  const response = await apiFetch<NotificationItem[]>('/notifications', {
    params: {
      page: String(query.page ?? 1),
      limit: String(query.limit ?? NOTIFICATIONS_PAGE.defaultLimit),
      status: query.status ?? 'all',
    },
    cache: 'no-store',
  });
  return handleResponse({ response });
}

/** `GET /notifications/unread-count` — the bell's number (the real one; the bell caps it at 99+). */
export async function GET_UNREAD_NOTIFICATIONS_COUNT() {
  const response = await apiFetch<NotificationUnreadCount>('/notifications/unread-count', { cache: 'no-store' });
  return handleResponse({ response });
}

export async function MARK_NOTIFICATION_READ(id: Uuid) {
  const response = await apiFetch<NotificationItem>(`/notifications/${path(id)}/read`, { method: 'POST' });
  return handleResponse({ response });
}

export async function MARK_NOTIFICATION_UNREAD(id: Uuid) {
  const response = await apiFetch<NotificationItem>(`/notifications/${path(id)}/unread`, { method: 'POST' });
  return handleResponse({ response });
}

/** Every unread notification up to `upTo` (the newest the list showed): a later one stays unread. */
export async function MARK_ALL_NOTIFICATIONS_READ(upTo: IsoDateTime) {
  const response = await apiFetch<NotificationsReadAll>('/notifications/read-all', {
    method: 'POST',
    body: { upTo },
  });
  return handleResponse({ response });
}

export async function GET_NOTIFICATION_PREFERENCES() {
  const response = await apiFetch<NotificationPreferences>('/notifications/preferences', { cache: 'no-store' });
  return handleResponse({ response });
}

/** One or more switches; `enabled: null` goes back to the school's default. */
export async function UPDATE_NOTIFICATION_PREFERENCES(
  items: { type: string; channel: NotificationChannel; enabled: boolean | null }[],
) {
  const response = await apiFetch<NotificationPreferences>('/notifications/preferences', {
    method: 'PUT',
    body: { items },
  });
  return handleResponse({ response });
}

export async function GET_NOTIFICATION_SETTINGS() {
  const response = await apiFetch<NotificationSettings>('/settings/notifications', { cache: 'no-store' });
  return handleResponse({ response });
}

/** Only what changed: the switches that moved, the retention days that changed. */
export async function UPDATE_NOTIFICATION_SETTINGS(body: {
  defaults?: { type: string; channel: NotificationChannel; enabled: boolean }[];
  retention?: Partial<NotificationRetention>;
}) {
  const response = await apiFetch<NotificationSettings>('/settings/notifications', {
    method: 'PUT',
    body: { ...body },
  });
  return handleResponse({ response });
}
