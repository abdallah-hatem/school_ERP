'use server';

import type { AppIconName, Language, PushDevices, Uuid } from '@school-erp/shared';
import { headers } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';
import type { DownloadedFile } from '@/lib/types';

/*
 * The installed app and push alerts (§11 → Push). Device reads are the signed-in person's own and
 * change from one minute to the next: nothing is cached.
 */

/** One app icon drawn from the logo (public), as a download — the offline page inlines it. */
export async function GET_APP_ICON(name: AppIconName, version: string) {
  return apiFetch<DownloadedFile>(`/files/app-icon/${name}`, {
    params: { v: version },
    includeAuth: false,
    ignore401Redirect: true,
    responseType: 'file',
    cache: 'force-cache',
  });
}

/** `GET /notifications/push-devices` — whether this server sends alerts, its key, my devices. */
export async function GET_PUSH_DEVICES() {
  const response = await apiFetch<PushDevices>('/notifications/push-devices', { cache: 'no-store' });
  return handleResponse({ response });
}

/**
 * This browser gets my alerts. The user agent is the browser's (this action runs on the web
 * server, so the API would otherwise see the server's).
 */
export async function ADD_PUSH_DEVICE(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: Language;
}) {
  const userAgent = (await headers()).get('user-agent') ?? undefined;
  const response = await apiFetch<PushDevices>('/notifications/push-devices', {
    method: 'POST',
    body: { ...subscription, ...(userAgent ? { userAgent: userAgent.slice(0, 512) } : {}) },
  });
  return handleResponse({ response });
}

/** "Alerts on this device" off: the browser's endpoint stops getting alerts. */
export async function REMOVE_THIS_PUSH_DEVICE(endpoint: string) {
  const response = await apiFetch<PushDevices>('/notifications/push-devices/unsubscribe', {
    method: 'POST',
    body: { endpoint },
  });
  return handleResponse({ response });
}

/** My devices → Remove. */
export async function REMOVE_PUSH_DEVICE(id: Uuid) {
  const response = await apiFetch<PushDevices>(`/notifications/push-devices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleResponse({ response });
}
