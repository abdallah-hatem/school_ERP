/*
 * Which fetch cache an API request may use (security review, 2026-11-23). Every page is per-user
 * (CLAUDE.md rule 7), so an answer fetched with someone's session must never be kept by Next's data
 * cache and handed to someone else.
 *
 * Next 16 without `cacheComponents` (our config) caches no `fetch` by default, and `next: { tags }`
 * alone doesn't opt in — but `cache: 'force-cache'`, a `next.revalidate`, a route's `fetchCache` or
 * a later default would. So `apiFetch` doesn't rely on the default: a request carrying a session
 * (a bearer token) is always `cache: 'no-store'` and never has a `revalidate`. Its tags stay: a write's
 * `updateTag` / `revalidateTag` still expires them and refreshes the page (`expireTags`), which then
 * fetches afresh. A public request (no session: the school's name and logo, the app icons) keeps
 * what it asked for.
 */

export interface FetchCacheOptions {
  cache?: RequestCache;
  next?: { tags?: string[]; revalidate?: number | false };
}

/** `options` with the cache policy for a request with (`authenticated`) or without a session. */
export function withCachePolicy<T extends FetchCacheOptions>(options: T, authenticated: boolean): T {
  if (!authenticated) return options;
  const next = options.next ? { tags: options.next.tags } : undefined;
  return { ...options, cache: 'no-store', ...(next ? { next } : {}) };
}
