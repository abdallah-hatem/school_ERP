import {
  DEFAULT_TAX_RULE,
  InsuranceStatus,
  matchesSearch,
  PAGINATION,
  type AccountingPayrollLine,
  type AccountingPayrollLinesPage,
  type AccountingPayrollLinesQuery,
  type AccountingPayrollMonth,
  type AccountingPayrollMonthSheet,
  type AccountingPayrollYear,
  type SessionUser,
} from '@school-erp/shared';
import type { ReactElement } from 'react';
import { SchoolBrandingProvider } from '@/core/settings';
import type { Locale } from '@/shared/lib/i18n';
import { renderWithI18n } from '@/test/render';
import { AccountingI18n } from '../messages';
import { groupQuery, parseStatementQuery, type MonthLinesQuery, type StatementQuery } from '../lib/lines-query';

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
export const MONTH: AccountingPayrollMonthSheet = {
  month: '2026-10',
  status: 'PENDING',
  finalizedAt: null,
  hrRunId: '00000000-0000-4000-8000-0000000000f1',
  recordedAt: '2026-11-02T10:00:00.000Z',
  salaryVisible: true,
  totals: { employees: 3, net: 2_400_000, insuranceAmount: 110_000, incomeTax: 303_470, martyrTax: 1_408, gross: 2_814_878 },
  taxRule: DEFAULT_TAX_RULE,
  visibleLines: 3,
  lines: [line(), INSURED, FLOORED],
};

/** The same month for a viewer whose salary scope leaves Omar out (§2, P4). */
export const LIMITED_MONTH: AccountingPayrollMonthSheet = {
  ...MONTH,
  salaryVisible: false,
  totals: { employees: 3 },
  visibleLines: 2,
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

/**
 * A month of 29: 26 insured ("Insured 01"… codes EMP-0101…, three pages) and 3 not insured
 * ("Other 1"… / "موظف أخر 1"…), every gross 100.00.
 */
export const BIG_MONTH: AccountingPayrollMonthSheet = {
  ...MONTH,
  totals: { employees: 29, net: 2_900, insuranceAmount: 0, incomeTax: 0, martyrTax: 0, gross: 290_000 },
  lines: [
    ...Array.from({ length: 26 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return line({
        employeeId: `00000000-0000-4000-8000-0000000001${n}`,
        employeeCode: `EMP-01${n}`,
        nameEn: `Insured ${n}`,
        nameAr: `مؤمن ${n}`,
        insuranceStatus: 'INSURED',
        insuredSalary: 10_000,
        net: 10_000,
        insuranceAmount: 0,
        incomeTax: 0,
        martyrTax: 0,
        gross: 10_000,
      });
    }),
    ...Array.from({ length: 3 }, (_, i) =>
      line({
        employeeId: `00000000-0000-4000-8000-0000000002${String(i + 1).padStart(2, '0')}`,
        employeeCode: `EMP-020${i + 1}`,
        nameEn: `Other ${i + 1}`,
        nameAr: `موظف أخر ${i + 1}`,
        net: 10_000,
        incomeTax: 0,
        martyrTax: 0,
        gross: 10_000,
      }),
    ),
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
        summary: { month, status: 'PENDING' as const, finalizedAt: null, hrRunId: 'x', recordedAt: '2026-11-02T10:00:00.000Z', salaryVisible: true, totals: MONTH.totals },
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

// ── The API's side of the month screens (its own tests are the API's) ─────────────────────────

/** The month as `GET /accounting/payroll/:month` sends it: no lines. */
export function detailOf(sheet: AccountingPayrollMonthSheet): AccountingPayrollMonth {
  const { lines: _lines, ...month } = sheet;
  return month;
}

/**
 * What `GET /accounting/payroll/:month/lines` answers for `query`: by code, searched by code or
 * either name, one insurance group, one page, and the totals over every match (money only with
 * every salary).
 */
export function pageOf(sheet: AccountingPayrollMonthSheet, query: AccountingPayrollLinesQuery = {}): AccountingPayrollLinesPage {
  const matching = sheet.lines
    .filter((l) => !query.insurance || l.insuranceStatus === query.insurance)
    .filter((l) => matchesSearch(query.search ?? '', [l.employeeCode, l.nameEn, l.nameAr]))
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  const page = query.page ?? PAGINATION.defaultPage;
  const limit = query.limit ?? PAGINATION.defaultLimit;
  const sum = (k: 'net' | 'insuranceAmount' | 'incomeTax' | 'martyrTax' | 'gross') => matching.reduce((n, l) => n + (l[k] ?? 0), 0);
  return {
    items: matching.slice((page - 1) * limit, page * limit),
    total: matching.length,
    page,
    limit,
    totals: sheet.salaryVisible
      ? { employees: matching.length, net: sum('net'), insuranceAmount: sum('insuranceAmount'), incomeTax: sum('incomeTax'), martyrTax: sum('martyrTax'), gross: sum('gross') }
      : { employees: matching.length },
  };
}

/** Accounting → Payroll, one month, as its screen hands it to `PayrollMonth`. */
export function monthView(sheet: AccountingPayrollMonthSheet, query: MonthLinesQuery = { page: 1, limit: PAGINATION.defaultLimit }) {
  return { month: detailOf(sheet), lines: pageOf(sheet, query), query };
}

/** The payroll taxes statement, as its screen hands it to `Statement`. */
export function statementView(sheet: AccountingPayrollMonthSheet, query: StatementQuery = parseStatementQuery({})) {
  return {
    month: detailOf(sheet),
    query,
    insured: pageOf(sheet, groupQuery(query, true)),
    notInsured: pageOf(sheet, groupQuery(query, false)),
    groupSizes: {
      insured: sheet.lines.filter((l) => l.insuranceStatus === InsuranceStatus.INSURED).length,
      notInsured: sheet.lines.filter((l) => l.insuranceStatus !== InsuranceStatus.INSURED).length,
    },
  };
}
