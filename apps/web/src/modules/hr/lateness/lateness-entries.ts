import {
  latenessDays,
  SETTING_LIMITS,
  type LatenessRule,
  type LatenessRow,
  type Uuid,
} from '@school-erp/shared';

/*
 * Pure state of the lateness grid: what HR typed per employee, whether it is valid, what it costs
 * under the live rule (the shared `latenessDays` — never a second copy) and what "Save all" sends.
 */

export const MINUTES_MAX = SETTING_LIMITS.latenessMinutesMax;

/** Typed text → whole minutes 0..6,000, or `null` when invalid. Empty counts as 0. */
export function parseMinutes(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= MINUTES_MAX ? value : null;
}

export interface EntryView {
  minutes: number | null;
  invalid: boolean;
  changed: boolean;
  /** Days under the rule; `null` while the minutes are invalid or the rule is unknown. */
  days: number | null;
}

export function viewEntry(row: LatenessRow, draft: string | undefined, rule: LatenessRule | null): EntryView {
  const minutes = draft === undefined ? row.minutes : parseMinutes(draft);
  const invalid = minutes === null;
  return {
    minutes,
    invalid,
    changed: !invalid && minutes !== row.minutes,
    days: invalid || !rule ? null : latenessDays(minutes, rule),
  };
}

export type Drafts = Record<Uuid, string>;

export interface GridState {
  invalidCount: number;
  entries: { employeeId: Uuid; minutes: number }[];
  totalMinutes: number;
  /** `null` when any row is invalid or the rule is unknown. */
  totalDays: number | null;
}

/** The whole month: invalid rows, the changed entries "Save all" sends, and the live totals. */
export function gridState(rows: LatenessRow[], drafts: Drafts, rule: LatenessRule | null): GridState {
  let invalidCount = 0;
  let totalMinutes = 0;
  let totalDays: number | null = rule ? 0 : null;
  const entries: GridState['entries'] = [];
  for (const row of rows) {
    const view = viewEntry(row, drafts[row.employee.id], rule);
    if (view.invalid || view.minutes === null) {
      invalidCount += 1;
      totalDays = null;
      continue;
    }
    totalMinutes += view.minutes;
    if (totalDays !== null && view.days !== null) totalDays += view.days;
    if (view.changed) entries.push({ employeeId: row.employee.id, minutes: view.minutes });
  }
  return { invalidCount, entries, totalMinutes, totalDays };
}

/** Case-insensitive match on code, English or Arabic name. */
export function matchesSearch(row: LatenessRow, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  const { code, nameEn, nameAr } = row.employee;
  return [code, nameEn, nameAr].some((value) => value.toLocaleLowerCase().includes(q));
}
