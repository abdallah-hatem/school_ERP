import {
  SETTINGS_HISTORY_ACTION_KEYS,
  SETTINGS_HISTORY_ACTIONS,
  type AuditChange,
  type SettingsHistoryAction,
} from '@school-erp/shared';
import { DatabaseService } from '../../src/database/database.service';

/*
 * Settings history in e2e, read from `audit_entries` (D9). The audit log is append-only — tests
 * can't delete entries — so a suite takes a `mark` (the latest `seq`) and reads only what was
 * written after it.
 */

/** The latest entry's `seq` (0 when empty): read only entries after it. */
export async function historyMark(db: DatabaseService): Promise<bigint> {
  const last = await db.auditEntry.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true } });
  return last?.seq ?? BigInt(0);
}

/** One changed key, shaped like the old `setting_changes` row (scope upper-cased). */
export interface HistoryRow {
  entryId: string;
  action: SettingsHistoryAction;
  scope: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  changedById: string | null;
  changedAt: Date;
}

/** Settings-history changes written after `mark`, oldest first, optionally for some keys. */
export async function historyRows(
  db: DatabaseService,
  mark: bigint,
  keys?: string | string[],
): Promise<HistoryRow[]> {
  const wanted = keys === undefined ? null : new Set(Array.isArray(keys) ? keys : [keys]);
  const entries = await db.auditEntry.findMany({
    where: { seq: { gt: mark }, action: { in: SETTINGS_HISTORY_ACTION_KEYS } },
    orderBy: { seq: 'asc' },
  });
  return entries.flatMap((e) =>
    (e.changes as unknown as AuditChange[])
      .filter((c) => !wanted || wanted.has(c.field))
      .map((c) => ({
        entryId: e.id,
        action: e.action as SettingsHistoryAction,
        scope: SETTINGS_HISTORY_ACTIONS[e.action as SettingsHistoryAction].toUpperCase(),
        key: c.field,
        oldValue: c.before,
        newValue: c.after,
        changedById: e.actorId,
        changedAt: e.at,
      })),
  );
}

/** Polls until `count()` reaches `n` (for history written after the response), then returns it. */
export async function waitForCount(count: () => Promise<number>, n: number): Promise<number> {
  for (let i = 0; i < 50 && (await count()) < n; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  return count();
}
