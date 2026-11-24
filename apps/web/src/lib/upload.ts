import type { ApiResult } from '@/lib/types';

/*
 * The browser side of a large upload: one file, posted to this app's upload Route Handler
 * (`/api/upload/…`, `upload-proxy.ts`), which streams it to the API. Answers in `apiFetch`'s shape
 * (`ApiResult`), so callers run it through `callApi` like any endpoint — toasts, the sign-in
 * redirect on 401. Only for uploads; every other call goes through a module's `apis.ts`.
 */

export async function uploadFile<T>(url: string, file: File): Promise<ApiResult<T>> {
  const form = new FormData();
  form.append('file', file);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body: form, credentials: 'same-origin' });
  } catch (err) {
    return { success: false, status: 0, message: err instanceof Error ? err.message : 'Network error', data: null, networkError: true };
  }
  const body: unknown = await res.json().catch(() => null);
  const merge: Record<string, unknown> = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : { data: body };
  const message = typeof merge.message === 'string' ? merge.message : 'An error occurred';
  if (res.status === 401) return { unauthorized: true, redirect: '/login', message };
  if (!res.ok) return { ...merge, success: false, status: res.status, message };
  return { ...merge, success: true, status: res.status } as ApiResult<T>;
}
