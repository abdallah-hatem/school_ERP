import { monthOf, type Uuid } from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';
import { EmployeePayroll } from './components/employee-payroll';
import { PayslipUnavailable, PayslipView } from './components/payslip-view';
import { RunPage } from './components/run-page';
import { RunsList } from './components/runs-list';
import { loadEmployeePayroll, loadPayslip, loadRun, loadRuns } from './lib/load';
import { parseRunQuery, parseRunsQuery, type SearchParamsRecord } from './lib/run-query';
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

export async function PayrollRunScreen({
  locale,
  id,
  searchParams,
}: {
  locale: Locale;
  id: Uuid;
  searchParams: SearchParamsRecord;
}) {
  const query = parseRunQuery(searchParams);
  const data = await loadRun(id, query);
  return (
    <PayrollI18n locale={locale}>
      <RunPage
        basePath={payrollPath(locale)}
        settingsHref={`/${locale}/settings`}
        penaltiesHref={`/${locale}/penalties`}
        query={query}
        run={data.run}
        asOf={data.asOf}
        departments={data.departments}
        settings={data.settings}
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
