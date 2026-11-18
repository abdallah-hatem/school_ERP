import {
  DEFAULT_TAX_RULE,
  type AccountingPayrollLine,
  type AccountingPayrollMonth,
  type AccountingPayrollYear,
  type SessionUser,
} from '@school-erp/shared';
import type { ReactElement } from 'react';
import { SchoolBrandingProvider } from '@/core/settings';
import type { Locale } from '@/shared/lib/i18n';
import { renderWithI18n } from '@/test/render';
import { AccountingI18n } from '../messages';

/** Accounting screens under test: their messages, the school's name, and a session. */
export function renderAccounting(ui: ReactElement, locale: Locale = 'en', session?: SessionUser) {
  return renderWithI18n(
    <SchoolBrandingProvider initial={{ nameEn: 'Demo School', nameAr: 'مدرسة تجريبية', logoUrl: null }}>
      <AccountingI18n locale={locale}>{ui}</AccountingI18n>
    </SchoolBrandingProvider>,
    { locale, ...(session ? { session } : {}) },
  );
}

export const line = (over: Partial<AccountingPayrollLine> = {}): AccountingPayrollLine => ({
  employeeId: '00000000-0000-4000-8000-000000000001',
  employeeCode: 'EMP-0001',
  nameEn: 'Salma Adel',
  nameAr: 'سلمى عادل',
  insuranceStatus: 'NOT_INSURED',
  salaryVisible: true,
  insuredSalary: null,
  net: 1_200_000,
  insuranceAmount: 0,
  incomeTax: 151_732,
  martyrTax: 676,
  gross: 1_352_408,
  ...over,
});

const INSURED = line({
  employeeId: '00000000-0000-4000-8000-000000000002',
  employeeCode: 'EMP-0002',
  nameEn: 'Omar Fathy',
  nameAr: 'عمر فتحي',
  insuranceStatus: 'INSURED',
  insuredSalary: 500_000,
  insuranceAmount: 55_000,
  incomeTax: 151_738,
  martyrTax: 704,
  gross: 1_407_442,
});

const FLOORED = line({
  employeeId: '00000000-0000-4000-8000-000000000003',
  employeeCode: 'EMP-0003',
  nameEn: 'Hana Nabil',
  nameAr: 'هنا نبيل',
  insuranceStatus: 'INSURED',
  insuredSalary: 500_000,
  net: 0,
  insuranceAmount: 55_000,
  incomeTax: 0,
  martyrTax: 28,
  gross: 55_028,
});

/** October 2026: one employee not insured, two insured (one floored at net 0). */
export const MONTH: AccountingPayrollMonth = {
  month: '2026-10',
  hrRunId: '00000000-0000-4000-8000-0000000000f1',
  recordedAt: '2026-11-02T10:00:00.000Z',
  salaryVisible: true,
  totals: { employees: 3, net: 2_400_000, insuranceAmount: 110_000, incomeTax: 303_470, martyrTax: 1_408, gross: 2_814_878 },
  taxRule: DEFAULT_TAX_RULE,
  lines: [line(), INSURED, FLOORED],
};

/** The same month for a viewer whose salary scope leaves Omar out (§2, P4). */
export const LIMITED_MONTH: AccountingPayrollMonth = {
  ...MONTH,
  salaryVisible: false,
  totals: { employees: 3 },
  lines: [
    line(),
    {
      employeeId: INSURED.employeeId,
      employeeCode: INSURED.employeeCode,
      nameEn: INSURED.nameEn,
      nameAr: INSURED.nameAr,
      insuranceStatus: 'INSURED',
      salaryVisible: false,
    },
    FLOORED,
  ],
};

/** 2026: September and October approved, November a draft in HR, the rest nothing. */
export const YEAR: AccountingPayrollYear = {
  year: 2026,
  months: Array.from({ length: 12 }, (_, i) => {
    const month = `2026-${String(i + 1).padStart(2, '0')}`;
    if (month === '2026-09' || month === '2026-10') {
      return {
        month,
        state: 'APPROVED' as const,
        summary: { month, hrRunId: 'x', recordedAt: '2026-11-02T10:00:00.000Z', salaryVisible: true, totals: MONTH.totals },
      };
    }
    if (month === '2026-11') return { month, state: 'DRAFT' as const };
    return { month, state: 'NONE' as const };
  }),
};

export const EMPTY_YEAR: AccountingPayrollYear = {
  year: 2025,
  months: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, '0')}`, state: 'NONE' as const })),
};
