import type {
  Department,
  EmployeePayrollLine,
  PayrollRun,
  PayrollRunQuery,
  PayrollRunSummary,
  Payslip,
  Uuid,
} from '@school-erp/shared';
import { notFound } from 'next/navigation';
import { GET_DEPARTMENTS } from '../../employees/apis';
import { GET_EMPLOYEE_PAYROLL_LINES, GET_PAYROLL_RUN, GET_PAYROLL_RUNS, GET_PAYSLIP } from '../apis';
import type { RunsListQuery } from './run-query';

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
  /** This server's clock before the run was read: the run page keeps a newer mutation result over it. */
  asOf: number;
  /** Every department, hidden ones too (a line keeps the department it had). */
  departments: Department[];
}

/** An unknown or malformed run id is the not-found page; any other failure throws to the boundary. */
export async function loadRun(id: Uuid, query: PayrollRunQuery): Promise<RunPageData> {
  const asOf = Date.now();
  // The run carries the HR rules its panel shows: no separate settings read (Principal and
  // Accountant may view runs without holding `hr.settings.view`).
  const [res, departments] = await Promise.all([GET_PAYROLL_RUN(id, query), GET_DEPARTMENTS(true)]);
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  if (!res.success || !res.data) throw new Error(res.message ?? 'Payroll run failed to load');
  return {
    run: res.data,
    asOf,
    departments: departments.success && Array.isArray(departments.data) ? departments.data : [],
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

export interface EmployeePayrollData {
  /** `null` when the history can't be read (an error state with a retry). */
  rows: EmployeePayrollLine[] | null;
  total: number;
}

/** The employee's line in each run, newest month first — one paginated request. */
export async function loadEmployeePayroll(employeeId: Uuid, query: RunsListQuery): Promise<EmployeePayrollData> {
  const res = await GET_EMPLOYEE_PAYROLL_LINES(employeeId, query);
  if (!res.success || !Array.isArray(res.data)) return { rows: null, total: 0 };
  return { rows: res.data, total: res.meta?.total ?? res.data.length };
}
