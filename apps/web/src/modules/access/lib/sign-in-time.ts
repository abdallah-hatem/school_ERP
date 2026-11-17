import type { IsoDateTime } from '@school-erp/shared';
import { schoolDay, SCHOOL_TIME_ZONE } from '@/core/audit';
import type { Locale, Translate } from '@/shared/lib/i18n';

const INTL: Record<Locale, string> = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

const fmt = (locale: Locale, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(INTL[locale], { timeZone: SCHOOL_TIME_ZONE, hourCycle: 'h23', ...options });

/**
 * When someone last signed in, as the Users list says it: `Today, 09:12`, `14 Nov, 10:30`,
 * `2 Oct 2025, 12:45` (another year), or `Never`. School time, Latin digits. `now` comes from the
 * server render so both sides agree on "today".
 */
export function formatSignIn(at: IsoDateTime | null, now: IsoDateTime, locale: Locale, t: Translate): string {
  if (!at) return t('access.users.never');
  const time = fmt(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
  if (schoolDay(at) === schoolDay(now)) return t('access.users.today', { time });
  const sameYear = schoolDay(at).slice(0, 4) === schoolDay(now).slice(0, 4);
  return fmt(locale, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at));
}
