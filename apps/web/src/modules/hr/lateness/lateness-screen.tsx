import { monthOf } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { LatenessBoard } from './lateness-board';
import { resolveLatenessQuery, resolveMonth } from './lateness-month';
import { loadLateness } from './load-lateness';
import { latenessMessages } from './messages';

export { latenessMessages, resolveMonth };

/**
 * Server: loads one page of the month's list (`?month&search&page`, searched and paged by the API,
 * with departments, its lock, the rule its days use and the month's totals).
 */
export async function LatenessScreen({
  locale,
  month: requested,
  search: rawSearch,
  page: rawPage,
}: {
  locale: Locale;
  month?: string | string[];
  search?: string | string[];
  page?: string | string[];
}) {
  const current = monthOf(new Date());
  const month = resolveMonth(requested, current);
  const query = resolveLatenessQuery(rawSearch, rawPage);
  const data = await loadLateness(month, query);
  return (
    <I18nProvider messages={latenessMessages(locale)}>
      {/* Keyed by month: switching month starts from that month's saved values. */}
      <LatenessBoard key={month} month={month} maxMonth={current} search={query.search ?? ''} {...data} />
    </I18nProvider>
  );
}
