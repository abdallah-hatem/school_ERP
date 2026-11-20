import ExcelJS from 'exceljs';
import { DEFAULT_TAX_RULE, type AccountingPayrollMonth } from '@school-erp/shared';
import { buildPayrollTaxesSheet } from './payroll-taxes-sheet';

const month = (over: Partial<AccountingPayrollMonth> = {}): AccountingPayrollMonth => ({
  month: '2026-10',
  status: 'PENDING',
  finalizedAt: null,
  hrRunId: 'hr-run',
  recordedAt: '2026-11-02T10:00:00.000Z',
  salaryVisible: true,
  totals: { employees: 2, net: 2_400_000, insuranceAmount: 55_000, incomeTax: 303_470, martyrTax: 1_380, gross: 2_759_850 },
  taxRule: DEFAULT_TAX_RULE,
  lines: [
    {
      employeeId: 'a',
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
    },
    {
      employeeId: 'b',
      employeeCode: 'EMP-0002',
      nameEn: 'Omar Fathy',
      nameAr: 'عمر فتحي',
      insuranceStatus: 'INSURED',
      salaryVisible: true,
      insuredSalary: 500_000,
      net: 1_200_000,
      insuranceAmount: 55_000,
      incomeTax: 151_738,
      martyrTax: 704,
      gross: 1_407_442,
    },
  ],
  ...over,
});

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe('buildPayrollTaxesSheet', () => {
  it('one row per line in EGP, a bold total, and a second sheet with the tax rule', async () => {
    const wb = await read(await buildPayrollTaxesSheet(month(), 'en'));
    const [lines, rule] = wb.worksheets;
    expect(lines?.name).toBe('Payroll taxes');
    expect(lines?.getRow(1).values).toEqual([
      undefined,
      'Employee code',
      'Name (English)',
      'Name (Arabic)',
      'Insurance',
      'Insured salary (EGP)',
      'Net paid (EGP)',
      'Insurance share (EGP)',
      'Income tax (EGP)',
      "Martyrs' fund (EGP)",
      'Gross (EGP)',
    ]);
    expect(lines?.getRow(3).values).toEqual([undefined, 'EMP-0002', 'Omar Fathy', 'عمر فتحي', 'Insured', 5000, 12000, 550, 1517.38, 7.04, 14074.42]);
    const total = lines?.getRow(4);
    expect(total?.getCell(1).value).toBe('Total');
    expect(total?.getCell(10).value).toBe(27598.5);
    expect(total?.font?.bold).toBe(true);

    expect(rule?.name).toBe('Tax rule');
    // Default slices: 5,000 at 0%, then 1,250 at 10% from 5,000; the last one is "the rest".
    expect(rule?.getRow(2).values).toEqual([undefined, 1, 0, 5000, 0]);
    expect(rule?.getRow(3).values).toEqual([undefined, 2, 5000, 1250, 10]);
    const rows = rule?.getSheetValues().filter(Boolean) as unknown[][];
    expect(rows.some((r) => r[1] === 'The rest')).toBe(true);
    expect(rows.some((r) => r[1] === 'Employee insurance share (% of the insured salary)' && r[4] === 11)).toBe(true);
  });

  it('a line outside the viewer\'s salary scope says "Salary hidden" with no amounts, and there is no total (§2, P4)', async () => {
    const data = month({ salaryVisible: false, totals: { employees: 2 } });
    const hidden = data.lines[1];
    data.lines[1] = {
      employeeId: hidden.employeeId,
      employeeCode: hidden.employeeCode,
      nameEn: hidden.nameEn,
      nameAr: hidden.nameAr,
      insuranceStatus: hidden.insuranceStatus,
      salaryVisible: false,
    };
    const [lines] = (await read(await buildPayrollTaxesSheet(data, 'en'))).worksheets;
    expect(lines?.getRow(3).values).toEqual([undefined, 'EMP-0002', 'Omar Fathy', 'عمر فتحي', 'Insured', 'Salary hidden']);
    expect(lines?.rowCount).toBe(3);
  });

  it('in Arabic: Arabic headers, right to left', async () => {
    const [lines] = (await read(await buildPayrollTaxesSheet(month(), 'ar'))).worksheets;
    expect(lines?.name).toBe('ضرائب الرواتب');
    expect(lines?.getCell('A1').value).toBe('كود الموظف');
    expect(lines?.views[0]?.rightToLeft).toBe(true);
  });
});
