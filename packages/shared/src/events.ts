import type { Month, Uuid } from './types/common';

/** Event names: `<module>.<thing>.<past-tense>` (docs/ARCHITECTURE.md). */
export const HrEvent = {
  EMPLOYEE_HIRED: 'employee.hired',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_DEACTIVATED: 'employee.deactivated',
  PAYROLL_APPROVED: 'payroll.approved',
} as const;
export type HrEvent = (typeof HrEvent)[keyof typeof HrEvent];

export interface EmployeeHiredEvent {
  employeeId: Uuid;
  at: string;
}
export interface EmployeeUpdatedEvent {
  employeeId: Uuid;
  at: string;
}
export interface EmployeeDeactivatedEvent {
  employeeId: Uuid;
  at: string;
}
export interface PayrollApprovedEvent {
  runId: Uuid;
  month: Month;
  approvedById: Uuid;
  at: string;
}
