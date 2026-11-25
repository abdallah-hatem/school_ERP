import { describe, expect, it } from 'vitest';
import { diff, isRowLike, tolerance, type MeasuredBlock } from '../../e2e/support/skeleton-diff';

/*
 * The skeleton spec's comparison (e2e/support/skeleton-diff.ts). Table rows and list cards are held
 * to ±2px: the employee Payroll tab's rows were ~4px short (a text bar for a pill) and ±8px let it
 * through (owner, 2026-11-25). Every other block keeps ±8px / ±5%.
 */

const block = (name: string, width: number, height: number, extra: Partial<MeasuredBlock> = {}): MeasuredBlock => ({
  name,
  width,
  height,
  measure: 'size',
  ...extra,
});

describe('skeleton diff', () => {
  it('keeps ±8px, or ±5% over 160px, for other blocks', () => {
    expect(tolerance(40, 44)).toBe(8);
    expect(tolerance(400, 410)).toBe(20.5);
    expect(diff([block('header', 800, 60)], [block('header', 800, 67)])).toEqual([]);
    expect(diff([block('header', 800, 60)], [block('header', 800, 69)])).toHaveLength(1);
  });

  it('holds a table row to ±2px in height', () => {
    expect(isRowLike({ name: 'table-row', each: true })).toBe(true);
    const row = (h: number) => [block('table-row', 1000, h, { each: true })];
    expect(diff(row(57), row(59))).toEqual([]);
    // The Payroll tab as it was: a 53px skeleton row for a 57px loaded one.
    expect(diff(row(53), row(57))).toEqual([expect.stringContaining('table-row.height: skeleton 53 vs loaded 57')]);
  });

  it('holds a list card to ±2px in height unless only its width is compared', () => {
    expect(isRowLike({ name: 'table-card', each: true })).toBe(true);
    expect(isRowLike({ name: 'employee-card', each: true })).toBe(true);
    // One card on its own (a details or form card) keeps the usual tolerance.
    expect(isRowLike({ name: 'details-card', each: false })).toBe(false);
    expect(diff([block('table-card', 340, 150, { each: true })], [block('table-card', 340, 154, { each: true })])).toHaveLength(1);
    expect(
      diff([block('table-card', 340, 150, { each: true, measure: 'width' })], [block('table-card', 340, 190, { each: true, measure: 'width' })]),
    ).toEqual([]);
  });

  it('keeps the usual tolerance for a row or card width', () => {
    const row = (w: number) => [block('table-row', w, 57, { each: true })];
    expect(diff(row(1000), row(1006))).toEqual([]);
  });

  it('reports blocks that differ in order', () => {
    expect(diff([block('header', 1, 1), block('table', 1, 1)], [block('table', 1, 1)])[0]).toContain('blocks differ');
  });
});
