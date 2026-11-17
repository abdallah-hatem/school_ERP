import { isMonth, type Month } from '@school-erp/shared';

/** `?month=` when valid and not in the future, else this month. */
export function resolveMonth(requested: string | string[] | undefined, current: Month): Month {
  const value = Array.isArray(requested) ? requested[0] : requested;
  return isMonth(value) && value <= current ? value : current;
}
