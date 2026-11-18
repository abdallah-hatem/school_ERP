import { AuditEntityType, type NotificationSubject, type Uuid } from '@school-erp/shared';

/*
 * HR's approval notifications (§11, plan N2) — the parts with no database: which employee a subject
 * is about, and the values of the "payroll ready" sentence for one reader.
 */

/** The subject entity types HR sends about (the same names as its audit entries). */
export const HR_SUBJECT = {
  EMPLOYEE: AuditEntityType.EMPLOYEE,
  PENALTY: AuditEntityType.PENALTY,
  PAYROLL_RUN: AuditEntityType.PAYROLL_RUN,
} as const;

/**
 * The employee a subject is about: its `employeeId`, or the record itself for an `employee`
 * subject. Null when there is none — no scoped reader covers it (fail closed).
 */
export function subjectEmployee(subject: NotificationSubject): Uuid | null {
  if (subject.employeeId) return subject.employeeId;
  return subject.entityType === HR_SUBJECT.EMPLOYEE ? subject.entityId : null;
}

/**
 * Whether each subject's employee is among `covered` (the employees a reader's scope covers),
 * in order.
 */
export function subjectsCovered(
  subjects: readonly NotificationSubject[],
  covered: ReadonlySet<Uuid>,
): boolean[] {
  return subjects.map((s) => {
    const employeeId = subjectEmployee(s);
    return employeeId !== null && covered.has(employeeId);
  });
}

/** What a "payroll ready" sentence needs, worked out once per calculation. */
export interface PayrollReadyFacts {
  month: string;
  /** Employees in the run. */
  count: number;
  /** The whole run's net, in piastres. */
  net: number;
}

/**
 * The values of the "payroll ready" sentence for one reader: the net only for someone who sees the
 * whole run's totals (`hr.payroll.view` at scope `all`, R7) — left out, not null, for anyone else
 * (spec edge 16, plan N2 edge 15). The web app then uses the sentence without the net.
 */
export function payrollReadyParams(
  facts: PayrollReadyFacts,
  seesTotals: boolean,
): Record<string, unknown> {
  return {
    month: facts.month,
    count: facts.count,
    ...(seesTotals ? { net: facts.net } : {}),
  };
}
