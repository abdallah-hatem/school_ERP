import {
  SETTING_DEFAULTS,
  type HrSettings,
  type PayrollAdjustment,
  type PayrollLine,
  type PayrollRun,
  type PayrollRunSummary,
  type Payslip,
} from '@school-erp/shared';
import type { ReactElement } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { renderWithI18n } from '@/test/render';
import { PayrollI18n } from '../messages';

/** Test data for the payroll screens. */

export const RUN_ID = '11111111-1111-4111-8111-111111111111';

export function line(
  overrides: Partial<PayrollLine> & Pick<PayrollLine, 'id' | 'employeeId' | 'nameEn' | 'nameAr'>,
): PayrollLine {
  return {
    employeeCode: 'EMP-0001',
    nationalId: '29001011234567',
    departmentId: 'd-math',
    departmentNameEn: 'Mathematics',
    departmentNameAr: 'الرياضيات',
    basicSalary: 1_400_000,
    workSystem: 'FULL_TIME',
    monthSalary: 1_400_000,
    dayValue: 46_667,
    penaltyDays: 0,
    penaltyAmount: 0,
    latenessMinutes: 0,
    latenessDays: 0,
    latenessAmount: 0,
    adjustmentAdditions: 0,
    adjustmentDeductions: 0,
    net: 1_400_000,
    flags: [],
    ...overrides,
  };
}

export const MONA = line({
  id: 'l-mona',
  employeeId: 'e-mona',
  employeeCode: 'EMP-0001',
  nameEn: 'Mona Khalil',
  nameAr: 'منى خليل',
});
export const SALMA = line({
  id: 'l-salma',
  employeeId: 'e-salma',
  employeeCode: 'EMP-0002',
  nameEn: 'Salma Adel',
  nameAr: 'سلمى عادل',
  penaltyDays: 1,
  penaltyAmount: 46_667,
  net: 1_353_333,
  flags: ['PENDING_PENALTIES'],
});

export const ADJ_MONA: PayrollAdjustment = {
  id: 'a-1',
  employeeId: 'e-mona',
  employeeCode: 'EMP-0001',
  nameEn: 'Mona Khalil',
  nameAr: 'منى خليل',
  type: 'ADDITION',
  amount: 50_000,
  reason: 'Exam supervision',
  createdAt: '2026-11-10T08:00:00.000Z',
  applied: true,
};

export function run(overrides: Partial<PayrollRun> = {}): PayrollRun {
  const lines = overrides.lines ?? [MONA, SALMA];
  return {
    id: RUN_ID,
    month: '2026-11',
    status: 'DRAFT',
    approvedAt: null,
    totals: {
      employees: lines.length,
      monthSalary: lines.reduce((s, l) => s + l.monthSalary, 0),
      penaltyAmount: lines.reduce((s, l) => s + l.penaltyAmount, 0),
      latenessAmount: 0,
      adjustmentAdditions: 0,
      adjustmentDeductions: 0,
      net: lines.reduce((s, l) => s + l.net, 0),
      flagged: lines.filter((l) => l.flags.length > 0).length,
    },
    adjustments: [],
    ...overrides,
    lines,
  };
}

/** The list shape of a run (no lines or adjustments). */
export function summary(r: PayrollRun = run()): PayrollRunSummary {
  return {
    id: r.id,
    month: r.month,
    status: r.status,
    totals: r.totals,
    approvedAt: r.approvedAt,
  };
}

export const SETTINGS: HrSettings = {
  lateness: {
    graceMinutes: SETTING_DEFAULTS['hr.lateness.graceMinutes'],
    steps: SETTING_DEFAULTS['hr.lateness.steps'],
    extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
  },
  payroll: {
    dayDivisor: 30,
    partTime: { PART_TIME_4: 80, PART_TIME_3: 60, PART_TIME_2: 40 },
  },
  penalties: { repetitionWindow: 'CONTRACT_YEAR' },
};

export const PAYSLIP: Payslip = {
  ...line({
    id: 'l-salma',
    employeeId: 'e-salma',
    employeeCode: 'EMP-0002',
    nameEn: 'Salma Adel',
    nameAr: 'سلمى عادل',
    penaltyDays: 1.5,
    penaltyAmount: 70_000,
    latenessMinutes: 90,
    latenessDays: 0.75,
    latenessAmount: 35_000,
    adjustmentAdditions: 50_000,
    adjustmentDeductions: 10_000,
    net: 1_335_000,
  }),
  month: '2026-11',
  penalties: [
    {
      date: '2026-11-03',
      violationNameEn: 'Late to class',
      violationNameAr: 'التأخر عن الحصة',
      level: 1,
      action: 'WARNING',
      days: null,
      amount: 0,
    },
    {
      date: '2026-11-09',
      violationNameEn: 'Absent without leave',
      violationNameAr: 'غياب بدون إذن',
      level: 2,
      action: 'DEDUCT_DAYS',
      days: 1,
      amount: 46_667,
    },
    {
      date: '2026-11-15',
      violationNameEn: 'Left early',
      violationNameAr: 'انصراف مبكر',
      level: 1,
      action: 'DEDUCT_DAYS',
      days: 0.5,
      amount: 23_333,
    },
  ],
  adjustments: [
    { type: 'ADDITION', amount: 50_000, reason: 'Exam supervision' },
    { type: 'DEDUCTION', amount: 10_000, reason: 'Lost library book' },
  ],
  school: { nameEn: 'Demo School', nameAr: 'مدرسة تجريبية', logoUrl: null },
};

export function renderPayroll(ui: ReactElement, locale: Locale = 'en') {
  return renderWithI18n(<PayrollI18n locale={locale}>{ui}</PayrollI18n>, {
    locale,
  });
}
