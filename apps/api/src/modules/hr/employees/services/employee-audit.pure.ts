import type { AuditLabel } from '@school-erp/shared';
import { toIsoDate } from '../../../../common/utils/dates.util';
import type { EmployeeDetailRow } from '../repositories/employees.repository';

/*
 * What an employee's audit entries store (§9, T28). Pure: a detail row in, a snapshot out. The
 * audit diff (core) keeps only the fields that differ between two snapshots.
 */

/** The record's id fields, stored by name — `{ nameEn, nameAr }` — so Activity reads "Science → Maths". */
const REF_FIELDS = {
  stage: 'stageId',
  department: 'departmentId',
  jobTitle: 'jobTitleId',
  manager: 'managerId',
} as const satisfies Partial<Record<keyof EmployeeDetailRow, string>>;

/** Bookkeeping the snapshot leaves out (the audit diff ignores them too). */
const SKIPPED: readonly string[] = ['id', 'createdAt', 'updatedAt'];

type Named = { nameEn: string; nameAr: string };

const names = (ref: Named | null): Named | null =>
  ref ? { nameEn: ref.nameEn, nameAr: ref.nameAr } : null;

/**
 * The employee as the audit log stores it: every field of the record in form order, dates as
 * `YYYY-MM-DD`, money in piastres, and the stage, department, job title and direct manager as
 * their two names under their id fields (`departmentId: { nameEn, nameAr }`) — a snapshot, so a
 * later rename never rewrites what the entry says. Salary-type values (`basicSalary`,
 * `insuredSalary`, the bank details) are stored like the rest and hidden when read by a viewer
 * without every salary (core's `hideSalaryValues`, P4).
 */
export function employeeAuditSnapshot(row: EmployeeDetailRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SKIPPED.includes(key)) continue;
    const refField = (REF_FIELDS as Record<string, string>)[key];
    if (refField) out[refField] = names(value as Named | null);
    else if (value instanceof Date) out[key] = toIsoDate(value);
    else out[key] = value;
  }
  return out;
}

/** The employee's two names, the label of their entries. */
export const employeeAuditLabel = (row: Pick<EmployeeDetailRow, 'nameEn' | 'nameAr'>): AuditLabel => ({
  en: row.nameEn,
  ar: row.nameAr,
});
