import { describe, expect, it } from 'vitest';
import { needsOwnLines, parseRunQuery, runFilterCount, runQueryString } from './run-query';

describe('run page query (?search&departmentId&flagged&page&limit)', () => {
  it('reads the page and a listed page size; the defaults stay out of the URL', () => {
    expect(parseRunQuery({ page: '3', limit: '50', search: ' mona ' })).toEqual({ search: 'mona', departmentId: undefined, flagged: undefined, page: 3, limit: 50 });
    // An unknown size reads as the nearest listed one; above 500 is capped.
    expect(parseRunQuery({ limit: '30' }).limit).toBe(25);
    expect(parseRunQuery({ limit: '9999' }).limit).toBe(500);
    expect(parseRunQuery({ page: '1', limit: '10' })).not.toHaveProperty('page');
    expect(parseRunQuery({ page: '1', limit: '10' })).not.toHaveProperty('limit');
    expect(runQueryString({ search: 'a', page: 2, limit: 50 })).toBe('?search=a&page=2&limit=50');
    expect(runQueryString({ page: 1, limit: 10 })).toBe('');
  });

  it('a page is not a filter, but the tab reads its own lines for it', () => {
    expect(runFilterCount({ page: 2 })).toBe(0);
    expect(needsOwnLines({})).toBe(false);
    expect(needsOwnLines({ page: 2 })).toBe(true);
    expect(needsOwnLines({ limit: 50 })).toBe(true);
    expect(needsOwnLines({ flagged: true })).toBe(true);
  });
});
