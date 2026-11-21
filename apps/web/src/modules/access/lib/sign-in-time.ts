import type { IsoDateTime } from '@school-erp/shared';
import { schoolDay } from '@/core/audit';
import { formatDateTime, formatTime } from '@/shared/lib/format';
import type { Locale, Translate } from '@/shared/lib/i18n';

/**
 * When someone last signed in, as the Users list says it: `Today, 9:12 AM`, `14 Nov, 10:30 AM`,
 * `2 Oct 2025, 12:45 PM` (another year), or `Never`. School time, 12-hour, Latin digits. `now`
 * comes from the server render so both sides agree on "today".
 */
export function formatSignIn(at: IsoDateTime | null, now: IsoDateTime, locale: Locale, t: Translate): string {
  if (!at) return t('access.users.never');
  if (schoolDay(at) === schoolDay(now)) return t('access.users.today', { time: formatTime(at, locale) });
  const sameYear = schoolDay(at).slice(0, 4) === schoolDay(now).slice(0, 4);
  return formatDateTime(at, locale, { year: !sameYear });
}

/** When a sign-in lock ends, as a time of day on the school clock (`10:45 AM`, Latin digits). */
export function formatLockEnd(at: IsoDateTime, locale: Locale): string {
  return formatTime(at, locale);
}
