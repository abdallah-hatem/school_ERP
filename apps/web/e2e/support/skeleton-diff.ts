/*
 * The skeleton spec's comparison (support/skeletons.ts measures, this judges), kept free of
 * Playwright so a unit test covers it (src/test/skeleton-diff.test.ts).
 */

export interface MeasuredBlock {
  name: string;
  width: number;
  height: number;
  measure: 'size' | 'width';
  /** One of a run (`data-skeleton-each`: a table row, a card in a list), measured once for the run. */
  each?: boolean;
  /** The loaded block's text, shown when it doesn't match (what wrapped). */
  text?: string;
}

/** ±8px, or ±5% for blocks over 160px. */
export function tolerance(a: number, b: number): number {
  return Math.max(8, 0.05 * Math.max(a, b));
}

/**
 * A table row's height, and a list card's (`table-card`, `employee-card`) when its height is
 * compared at all, match within ±2px. The employee profile's Payroll tab drew its status pill as a
 * thin text bar, each skeleton row ~4px short, and ±8px let it through (owner, 2026-11-25): a row
 * is short enough that a few px is the whole difference between a pill and a line of text.
 */
export const ROW_TOLERANCE = 2;

/** Whether `block`'s height is held to `ROW_TOLERANCE` rather than `tolerance()`. */
export function isRowLike(block: Pick<MeasuredBlock, 'name' | 'each'>): boolean {
  return block.name === 'table-row' || (block.each === true && /(^|-)card$/.test(block.name));
}

/** The allowed difference for one measurement of a block (its `width` or `height`). */
export function allowed(block: Pick<MeasuredBlock, 'name' | 'each'>, key: 'width' | 'height', a: number, b: number): number {
  return key === 'height' && isRowLike(block) ? ROW_TOLERANCE : tolerance(a, b);
}

export function diff(skeleton: MeasuredBlock[], loaded: MeasuredBlock[]): string[] {
  const problems: string[] = [];
  const names = (list: MeasuredBlock[]) => list.map((b) => b.name).join(' › ');
  const sized = (list: MeasuredBlock[]) => list.map((b) => `${b.name} ${b.width}×${b.height}`).join(' › ');
  if (names(skeleton) !== names(loaded)) {
    problems.push(`blocks differ\n    skeleton: ${sized(skeleton)}\n    loaded:   ${sized(loaded)}`);
    return problems;
  }
  skeleton.forEach((s, i) => {
    const l = loaded[i]!;
    const keys: ('width' | 'height')[] = s.measure === 'width' || l.measure === 'width' ? ['width'] : ['width', 'height'];
    for (const key of keys) {
      const limit = allowed({ name: s.name, each: s.each || l.each }, key, s[key], l[key]);
      if (Math.abs(s[key] - l[key]) > limit) {
        problems.push(`#${i} ${s.name}.${key}: skeleton ${s[key]} vs loaded ${l[key]} (±${Math.round(limit * 10) / 10}) — loaded: "${l.text ?? ''}"`);
      }
    }
  });
  return problems;
}
