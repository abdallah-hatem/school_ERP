import { InsuranceStatus, type AccountingPayrollMonth, type Language, type Piastres } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/accounting.json';
import en from '@school-erp/shared/locales/en/accounting.json';
import ExcelJS from 'exceljs';

const LABELS: Record<Language, (typeof en)['sheet']> = { en: en.sheet, ar: ar.sheet };

/** EGP with 2 decimals. */
const MONEY = '#,##0.00';
const MONEY_FIELDS = ['net', 'insuranceAmount', 'incomeTax', 'martyrTax', 'gross'] as const;
const egp = (p: Piastres) => p / 100;

/**
 * A month's payroll taxes as `.xlsx` (§10), in the caller's language. Sheet 1: one row per line
 * **as the viewer sees it** — a line outside their salary scope keeps its code, names and
 * insurance status and says "Salary hidden" instead of amounts (§2, P4) — then a bold total row,
 * only when the viewer sees every salary. Sheet 2: the tax rule the month was worked out with.
 */
export async function buildPayrollTaxesSheet(month: AccountingPayrollMonth, lang: Language): Promise<Buffer> {
  const t = LABELS[lang];
  const workbook = new ExcelJS.Workbook();
  const views = [{ rightToLeft: lang === 'ar', state: 'frozen' as const, ySplit: 1 }];

  const lines = workbook.addWorksheet(t.linesName, { views });
  lines.columns = [
    { header: t.code, key: 'code', width: 14 },
    { header: t.nameEn, key: 'nameEn', width: 30 },
    { header: t.nameAr, key: 'nameAr', width: 30 },
    { header: t.insurance, key: 'insurance', width: 16 },
    { header: t.insuredSalary, key: 'insuredSalary', width: 18, style: { numFmt: MONEY } },
    ...MONEY_FIELDS.map((key) => ({ header: t[key], key, width: 18, style: { numFmt: MONEY } })),
  ];
  lines.getRow(1).font = { bold: true };
  for (const line of month.lines) {
    const base = {
      code: line.employeeCode,
      nameEn: line.nameEn,
      nameAr: line.nameAr,
      insurance: line.insuranceStatus === InsuranceStatus.INSURED ? t.insured : t.notInsured,
    };
    if (!line.salaryVisible) {
      lines.addRow({ ...base, insuredSalary: t.salaryHidden });
      continue;
    }
    lines.addRow({
      ...base,
      insuredSalary: line.insuredSalary == null ? null : egp(line.insuredSalary),
      ...Object.fromEntries(MONEY_FIELDS.map((key) => [key, egp(line[key] ?? 0)])),
    });
  }
  // Month totals only for someone who sees every salary (the API leaves them out otherwise).
  if (month.salaryVisible) {
    const total = lines.addRow({
      code: t.total,
      ...Object.fromEntries(MONEY_FIELDS.map((key) => [key, egp(month.totals[key] ?? 0)])),
    });
    total.font = { bold: true };
  }

  const rule = workbook.addWorksheet(t.ruleName, { views });
  rule.columns = [
    { header: t.slice, key: 'slice', width: 34 },
    { header: t.from, key: 'from', width: 16, style: { numFmt: MONEY } },
    { header: t.width, key: 'width', width: 16, style: { numFmt: MONEY } },
    { header: t.rate, key: 'rate', width: 12 },
  ];
  rule.getRow(1).font = { bold: true };
  let from = 0;
  month.taxRule.brackets.forEach((bracket, i) => {
    rule.addRow({
      slice: bracket.width === null ? t.rest : i + 1,
      from: egp(from),
      width: bracket.width === null ? null : egp(bracket.width),
      rate: bracket.percent,
    });
    if (bracket.width !== null) from += bracket.width;
  });
  rule.addRow({});
  rule.addRow({ slice: t.insurancePercent, rate: month.taxRule.insurancePercent });
  rule.addRow({ slice: t.martyrPercent, rate: month.taxRule.martyrPercent });
  rule.addRow({});
  rule.addRow({ slice: t.month, from: month.month });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
