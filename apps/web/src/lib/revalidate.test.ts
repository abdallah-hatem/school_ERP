import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/cache', () => cache);

import { expireTags } from './revalidate';

/*
 * A write's tags (dry run 2026-11-20 b, finding 1): in a Server Action they expire at once with
 * `updateTag`, which also makes the browser drop its router cache — so the run's History opened
 * straight after Recalculate reads the new entry. Stale-while-revalidate (`revalidateTag(tag,
 * 'default')`) kept the History tab the browser already held.
 */
describe('expireTags', () => {
  beforeEach(() => {
    cache.revalidateTag.mockReset();
    cache.updateTag.mockReset();
  });

  it('expires every tag at once in a Server Action, never stale-while-revalidate', () => {
    expireTags(['hr-payroll-runs', 'hr-payroll-run-1'], true);
    expect(cache.updateTag.mock.calls).toEqual([['hr-payroll-runs'], ['hr-payroll-run-1']]);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });

  it('only marks the tags stale outside a Server Action (updateTag would throw)', () => {
    expireTags(['hr-penalties'], false);
    expect(cache.revalidateTag).toHaveBeenCalledWith('hr-penalties', 'max');
    expect(cache.updateTag).not.toHaveBeenCalled();
  });

  it('does nothing without tags', () => {
    expireTags(undefined, true);
    expireTags([], true);
    expect(cache.updateTag).not.toHaveBeenCalled();
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });
});
