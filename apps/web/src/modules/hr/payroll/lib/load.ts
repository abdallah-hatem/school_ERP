import type {
  Department,
  HrSettings,
  PayrollLine,
  PayrollRun,
  PayrollRunQuery,
  PayrollRunSummary,
  Payslip,
  Uuid,
} from '@school-erp/shared';
import { notFound } from 'next/navigation';
import { GET_DEPARTMENTS } from '../../employees/apis';
import { GET_HR_SETTINGS } from '../../lateness/apis';
import { GET_PAYROLL_RUN, GET_PAYROLL_RUNS, GET_PAYSLIP } from '../apis';
import { hasRunFilters, type RunsListQuery } from './run-query';

/** Server loaders for the payroll routes. A failed read becomes `null`, shown as an error state. */

export interface RunsListData {
  runs: PayrollRunSummary[] | null;
  total: number;
}

export async function loadRuns(query: RunsListQuery): Promise<RunsListData> {
  const res = await GET_PAYROLL_RUNS(query);
  if (!res.success || !Array.isArray(res.data)) return { runs: null, total: 0 };
  return { runs: res.data, total: res.meta?.total ?? res.data.length };
}

export interface RunPageData {
  run: PayrollRun;
  /** Every employee in the run, filters or not — decides which adjustments are "not applied". */
  runEmployeeIds: Uuid[];
  /** Every department, hidden ones too (a line keeps the department it had). */
  departments: Department[];
  /** `null` when the HR settings failed to load (the rules panel says so). */
  settings: HrSettings | null;
}

/** An unknown or malformed run id is the not-found page; any other failure throws to the boundary. */
export async function loadRun(id: Uuid, query: PayrollRunQuery): Promise<RunPageData> {
  const filtered = hasRunFilters(query);
  const [res, all, departments, settings] = await Promise.all([
    GET_PAYROLL_RUN(id, query),
    filtered ? GET_PAYROLL_RUN(id) : null,
    GET_DEPARTMENTS(true),
    GET_HR_SETTINGS(),
  ]);
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  if (!res.success || !res.data) throw new Error(res.message ?? 'Payroll run failed to load');
  const everyLine = all?.success && all.data ? all.data.lines : filtered ? null : res.data.lines;
  return {
    run: res.data,
    // Without the full list (a failed second read) assume every adjustment applies.
    runEmployeeIds: everyLine ? everyLine.map((l) => l.employeeId) : res.data.adjustments.map((a) => a.employeeId),
    departments: departments.success && Array.isArray(departments.data) ? departments.data : [],
    settings: settings.success && settings.data ? settings.data : null,
  };
}

export type PayslipData =
  | { kind: 'ok'; payslip: Payslip }
  /** The run is still a draft (409 `PAYROLL_NOT_APPROVED`): there is no payslip yet. */
  | { kind: 'draft'; error?: string; message: string };

export async function loadPayslip(id: Uuid, lineId: Uuid): Promise<PayslipData> {
  const res = await GET_PAYSLIP(id, lineId);
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  if (res.success === false && res.status === 409) return { kind: 'draft', error: res.error, message: res.message };
  if (!res.success || !res.data) throw new Error(res.message ?? 'Payslip failed to load');
  return { kind: 'ok', payslip: res.data };
}

export interface EmployeePayrollRow {
  run: PayrollRunSummary;
  line: PayrollLine;
}

/** How many recent runs the profile tab reads (two school years of months). */
export const PROFILE_RUNS_LIMIT = 24;

/**
 * The employee's line in each of the most recent runs, newest first. The API has no "lines of an
 * employee" route, so this reads the runs and asks each for lines matching the employee's code,
 * then keeps the line that is really theirs (a code search also matches longer codes).
 * `null` when the runs can't be read.
 */
export async function loadEmployeePayroll(employee: { id: Uuid; code: string }): Promise<EmployeePayrollRow[] | null> {
  const runs = await GET_PAYROLL_RUNS({ page: 1, limit: PROFILE_RUNS_LIMIT });
  if (!runs.success || !Array.isArray(runs.data)) return null;
  const details = await Promise.all(runs.data.map((run) => GET_PAYROLL_RUN(run.id, { search: employee.code })));
  const rows: EmployeePayrollRow[] = [];
  for (const [i, run] of runs.data.entries()) {
    const detail = details[i];
    if (!detail?.success || !detail.data) return null;
    const line = detail.data.lines.find((l) => l.employeeId === employee.id);
    if (line) rows.push({ run, line });
  }
  return rows;
}
