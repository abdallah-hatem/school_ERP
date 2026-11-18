import ExcelJS from 'exceljs';
import { buildBankSheet, type BankSheetRow } from './bank-sheet';

const row = (over: Partial<BankSheetRow>): BankSheetRow => ({
  employeeCode: 'EMP-0001',
  nameEn: 'Salma Adel',
  nameAr: 'سلمى عادل',
  nationalId: '29001011234567',
  bankName: 'National Bank of Egypt',
  bankAccountNumber: '0123456789012',
  iban: 'EG380019000500000000263180002',
  net: 1_983_333,
  ...over,
});

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

describe('buildBankSheet', () => {
  it('lists bank, account number and IBAN per employee, then a bold total of the nets', async () => {
    const sheet = await read(
      await buildBankSheet(
        [row({}), row({ employeeCode: 'EMP-0002', bankName: null, bankAccountNumber: null, iban: null, net: 520_001 })],
        'en',
      ),
    );
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Employee code',
      'Name (English)',
      'Name (Arabic)',
      'National ID',
      'Bank',
      'Account number',
      'IBAN',
      'Net (EGP)',
    ]);
    expect([5, 6, 7].map((c) => sheet.getRow(2).getCell(c).value)).toEqual([
      'National Bank of Egypt',
      '0123456789012',
      'EG380019000500000000263180002',
    ]);
    // Missing bank details → empty cells, never "null".
    expect([5, 6, 7].map((c) => sheet.getRow(3).getCell(c).value)).toEqual([null, null, null]);
    const total = sheet.getRow(4);
    expect(total.getCell(1).value).toBe('Total');
    // Summed in piastres: 19,833.33 + 5,200.01 = 25,033.34 exactly.
    expect(total.getCell(8).value).toBe(25_033.34);
    expect(total.font?.bold).toBe(true);
    expect(sheet.actualRowCount).toBe(4);
  });

  it('Arabic headers and total, right to left; an empty run still has its total row (0)', async () => {
    const sheet = await read(await buildBankSheet([], 'ar'));
    expect(sheet.views[0]?.rightToLeft).toBe(true);
    expect(sheet.getRow(1).getCell(5).value).toBe('البنك');
    expect(sheet.getRow(1).getCell(7).value).toBe('رقم IBAN');
    expect(sheet.getRow(2).getCell(1).value).toBe('الإجمالي');
    expect(sheet.getRow(2).getCell(8).value).toBe(0);
  });
});
