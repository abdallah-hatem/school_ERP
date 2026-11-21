import { revalidateTag, updateTag } from 'next/cache';

/**
 * Expires the cache tags a write changed (`apiFetch`'s `revalidateTags`).
 *
 * In a Server Action — every write here — `updateTag`: the tags expire at once and the action's
 * answer tells the browser to drop its router cache (prefetched and visited segments) and refresh
 * the page. `revalidateTag(tag, 'default')` (what this used to do) is stale-while-revalidate: the
 * next read still gets the old data and the browser keeps its router cache, so a tab opened
 * straight after a write showed what it held before it (dry run 2026-11-20 b: the run's History
 * empty right after Recalculate until a reload).
 *
 * Anywhere else (a Route Handler, where `updateTag` throws) the tags are only marked stale.
 */
export function expireTags(tags: readonly string[] | undefined, inServerAction: boolean): void {
  if (!tags?.length) return;
  for (const tag of tags) {
    if (inServerAction) updateTag(tag);
    else revalidateTag(tag, 'max');
  }
}
