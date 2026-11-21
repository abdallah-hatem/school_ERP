import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { SEED_ADMIN_EMAIL } from '@school-erp/shared';
import { env } from './env';

/*
 * A signed-in client for the API, so a spec reads the state it meets (which employee has a prior
 * penalty, what the run's lines hold) instead of assuming the seed it remembers. The browser never
 * uses this — every flow is driven through the screens.
 */

type Query = Record<string, string | number | boolean | undefined>;

export class Api {
  private constructor(private readonly ctx: APIRequestContext) {}

  /** Signs in as the seeded HR admin; the session cookie stays on this client. */
  static asAdmin(): Promise<Api> {
    return Api.as(SEED_ADMIN_EMAIL, env.adminPassword);
  }

  /** Signs in as any account that needs no password change (the seeded demo stage heads, §4). */
  static async as(email: string, password: string): Promise<Api> {
    const ctx = await request.newContext({
      baseURL: env.apiUrl,
      extraHTTPHeaders: { 'Accept-Language': 'en' },
    });
    const res = await ctx.post('/auth/login', { data: { email, password } });
    await unwrap(res, 'POST /auth/login');
    return new Api(ctx);
  }

  /** The raw response (for a refusal a spec expects: its status). */
  status(method: 'get' | 'post', path: string, data?: unknown): Promise<number> {
    const res = method === 'get' ? this.ctx.get(path) : this.ctx.post(path, { data: data ?? {} });
    return res.then((r) => r.status());
  }

  get<T>(path: string, params?: Query): Promise<T> {
    return this.ctx.get(path, { params: clean(params) }).then((res) => unwrap<T>(res, `GET ${path}`));
  }

  post<T>(path: string, data?: unknown): Promise<T> {
    return this.ctx.post(path, { data: data ?? {} }).then((res) => unwrap<T>(res, `POST ${path}`));
  }

  patch<T>(path: string, data: unknown): Promise<T> {
    return this.ctx.patch(path, { data }).then((res) => unwrap<T>(res, `PATCH ${path}`));
  }

  put<T>(path: string, data: unknown): Promise<T> {
    return this.ctx.put(path, { data }).then((res) => unwrap<T>(res, `PUT ${path}`));
  }

  dispose(): Promise<void> {
    return this.ctx.dispose();
  }
}

function clean(params?: Query): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<
    string,
    string | number | boolean
  >;
}

async function unwrap<T>(res: APIResponse, what: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
  } | null;
  if (!res.ok() || !body?.success) {
    throw new Error(`smoke: ${what} → ${res.status()} ${JSON.stringify(body)}`);
  }
  return body.data as T;
}
