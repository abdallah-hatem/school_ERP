import { monthOf, type Uuid } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';
import { EmployeePayroll } from './components/employee-payroll';
import { PayslipUnavailable, PayslipView } from './components/payslip-view';
import type { ReactNode } from 'react';
import { RunLines } from './components/run-page';
import { RunShell } from './components/run-shell';
import { RunsList } from './components/runs-list';
import { loadEmployeePayroll, loadPayslip, loadRun, loadRunLines, loadRuns } from './lib/load';
import { parseRunQuery, parseRunsQuery, runFilterCount, type SearchParamsRecord } from './lib/run-query';
import { PayrollI18n } from './messages';

/** Server screens rendered by the `payroll` routes (and the profile's payroll tab). */

const payrollPath = (locale: Locale) => `/${locale}/payroll`;

export async function PayrollRunsScreen({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: SearchParamsRecord;
}) {
  const query = parseRunsQuery(searchParams);
  const { runs, total } = await loadRuns(query);
  return (
    <PayrollI18n locale={locale}>
      <RunsList
        basePath={payrollPath(locale)}
        query={query}
        runs={runs}
        total={total}
        currentMonth={monthOf(new Date())}
      />
    </PayrollI18n>
  );
}

/**
 * The run layout (`payroll/[id]/(run)`): loads the whole run once and draws its header, notices and
 * tabs around the opened tab. A layout stays mounted across its tabs and filter changes, so neither
 * reads the run again; `router.refresh()` (after a write it can't apply) does.
 */
export async function PayrollRunLayout({ locale, id, children }: { locale: Locale; id: Uuid; children: ReactNode }) {
  const { run, asOf } = await loadRun(id);
  return (
    <PayrollI18n locale={locale}>
      <RunShell basePath={payrollPath(locale)} penaltiesHref={`/${locale}/penalties`} run={run} asOf={asOf}>
        {children}
      </RunShell>
    </PayrollI18n>
  );
}

/** The run's Employees tab: the lines (the layout's, or read with the URL's filters) and the rules. */
export async function PayrollRunLinesScreen({
  locale,
  id,
  searchParams,
}: {
  locale: Locale;
  id: Uuid;
  searchParams: SearchParamsRecord;
}) {
  const query = parseRunQuery(searchParams);
  const data = await loadRunLines(id, query, runFilterCount(query) > 0);
  return (
    <PayrollI18n locale={locale}>
      <RunLines
        basePath={payrollPath(locale)}
        settingsHref={`/${locale}/settings`}
        query={query}
        filtered={data.filtered}
        departments={data.departments}
      />
    </PayrollI18n>
  );
}

export async function PayslipScreen({ locale, id, lineId }: { locale: Locale; id: Uuid; lineId: Uuid }) {
  const data = await loadPayslip(id, lineId);
  const backHref = `${payrollPath(locale)}/${id}`;
  return (
    <PayrollI18n locale={locale}>
      {data.kind === 'ok' ? (
        <PayslipView payslip={data.payslip} backHref={backHref} />
      ) : (
        <PayslipUnavailable error={data.error} message={data.message} backHref={backHref} />
      )}
    </PayrollI18n>
  );
}

/** The body of the employee profile's "Payroll" tab (the profile layout draws the header around it). */
export async function EmployeePayrollSection({
  locale,
  employee,
  searchParams,
}: {
  locale: Locale;
  employee: { id: Uuid };
  searchParams: SearchParamsRecord;
}) {
  const query = parseRunsQuery(searchParams);
  const { rows, total } = await loadEmployeePayroll(employee.id, query);
  return (
    <PayrollI18n locale={locale}>
      <EmployeePayroll
        payrollPath={payrollPath(locale)}
        tabPath={`/${locale}/employees/${employee.id}/payroll`}
        rows={rows}
        total={total}
        page={query.page}
        limit={query.limit}
      />
    </PayrollI18n>
  );
}
