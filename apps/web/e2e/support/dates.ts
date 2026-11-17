import type { IsoDate, Month } from '@school-erp/shared';

/** Today in the local calendar — the same day the browser, the web server and the API see. */
export function todayIso(): IsoDate {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function currentMonth(): Month {
  return todayIso().slice(0, 7);
}
