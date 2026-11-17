import { isMonth, monthOf, type Month } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/lateness.json';
import en from '@school-erp/shared/locales/en/lateness.json';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { LatenessBoard } from './lateness-board';
import { loadLateness } from './load-lateness';

const MESSAGES: Record<Locale, MessageTree> = {
  en: { lateness: en } as unknown as MessageTree,
  ar: { lateness: ar } as unknown as MessageTree,
};

/** The lateness namespace for a locale (screens and tests nest it over the base messages). */
export function latenessMessages(locale: Locale): MessageTree {
  return MESSAGES[locale];
}

/** `?month=` when valid and not in the future, else this month. */
export function resolveMonth(requested: string | string[] | undefined, current: Month): Month {
  const value = Array.isArray(requested) ? requested[0] : requested;
  return isMonth(value) && value <= current ? value : current;
}

/** Server: loads the month's list, the live rule and departments, then hands them to the grid. */
export async function LatenessScreen({ locale, month: requested }: { locale: Locale; month?: string | string[] }) {
  const current = monthOf(new Date());
  const month = resolveMonth(requested, current);
  const data = await loadLateness(month);
  return (
    <I18nProvider messages={latenessMessages(locale)}>
      {/* Keyed by month: switching month starts from that month's saved values. */}
      <LatenessBoard key={month} month={month} maxMonth={current} {...data} />
    </I18nProvider>
  );
}
