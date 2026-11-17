/**
 * Token refresh used by `apiFetch` (Server Actions) and, from T2, by the middleware.
 * Server only. T2 aligns it with the final `/auth/refresh` contract (refresh rotation).
 */
export interface TokenPair {
  access_token: string;
  refresh_token?: string;
}

function isTokenPair(value: unknown): value is TokenPair {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).access_token === 'string'
  );
}

export async function refreshTokens(refreshToken: string): Promise<TokenPair | null> {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) return null;
  try {
    const res = await fetch(`${baseURL}/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${refreshToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    const data =
      typeof body === 'object' && body !== null && 'data' in body
        ? (body as { data: unknown }).data
        : body;
    return isTokenPair(data) ? data : null;
  } catch {
    return null;
  }
}
