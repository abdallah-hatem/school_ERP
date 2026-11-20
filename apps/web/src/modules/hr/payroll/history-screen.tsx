import { AuditEntityType, type Uuid } from '@school-erp/shared';
import { RecordHistoryScreen } from '@/core/audit/screens';
import { createTranslator, type Locale } from '@/shared/lib/i18n';
import type { SearchParamsRecord } from './lib/run-query';
import { payrollMessages } from './messages';

/**
 * Server: the run's History tab — who created, recalculated, adjusted, approved it, and Accounting
 * returning or finalizing it (every `hr.payroll.*` entry is filed against the run), by month, with
 * field and person filters (core/audit's record History). The run layout draws the header; this
 * tab never reads the run. The API answers the entries only to a whole-school payroll viewer (P4);
 * anyone else gets the not-found page.
 */
export function PayrollRunHistoryScreen({
  locale,
  runId,
  searchParams,
}: {
  locale: Locale;
  runId: Uuid;
  searchParams: SearchParamsRecord;
}) {
  const t = createTranslator(payrollMessages(locale), locale);
  return (
    <RecordHistoryScreen
      locale={locale}
      entityType={AuditEntityType.PAYROLL_RUN}
      entityId={runId}
      recordName=""
      description={t('payroll.tabs.historyDescription')}
      emptyBody={t('payroll.tabs.historyEmptyBody')}
      basePath={`/${locale}/payroll/${runId}/history`}
      searchParams={searchParams}
    />
  );
}
