import { pageOf } from './list-page.util';

describe('pageOf', () => {
  const rows = Array.from({ length: 23 }, (_, i) => i + 1);

  it('returns the asked page and the full total', () => {
    expect(pageOf(rows, 2, 10)).toEqual({ items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], total: 23, page: 2, limit: 10 });
    expect(pageOf(rows, 3, 10).items).toEqual([21, 22, 23]);
  });

  it('a page past the end is empty, the total still right', () => {
    expect(pageOf(rows, 9, 10)).toEqual({ items: [], total: 23, page: 9, limit: 10 });
  });

  it('caps the limit and floors page and limit at 1', () => {
    expect(pageOf(rows, 1, 1000, 20).limit).toBe(20);
    expect(pageOf(rows, 0, 0)).toMatchObject({ page: 1, limit: 1, items: [1] });
  });
});
