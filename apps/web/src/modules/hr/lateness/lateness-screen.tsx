import { monthOf } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { LatenessBoard } from './lateness-board';
import { resolveMonth } from './lateness-month';
import { loadLateness } from './load-lateness';
import { latenessMessages } from './messages';

export { latenessMessages, resolveMonth };

/** Server: loads the month's list (with departments and its lock) and the live rule for the grid. */
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
