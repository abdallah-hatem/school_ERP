import type { IsoDate } from '@school-erp/shared';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written `YYYY-MM-DD` (rejects `2026-02-30`). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** `YYYY-MM-DD` → a Date at UTC midnight (what Prisma stores in a `@db.Date` column). */
export function fromIsoDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** A `@db.Date` value (UTC midnight) → `YYYY-MM-DD`. */
export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/** Today's calendar date on the server's clock, `YYYY-MM-DD`. */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
