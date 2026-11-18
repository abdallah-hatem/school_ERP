import type { Language, Piastres } from '@school-erp/shared';
import ar from '@school-erp/shared/locales/ar/bank-sheet.json';
import en from '@school-erp/shared/locales/en/bank-sheet.json';
import ExcelJS from 'exceljs';

const LABELS: Record<Language, typeof en> = { en, ar };

/** Excel number format for the net column: EGP with 2 decimals. */
export const NET_NUMBER_FORMAT = '0.00';

export interface BankSheetRow {
  employeeCode: string;
  nameEn: string;
  nameAr: string;
  nationalId: string | null;
  /** The employee's bank details on file (§3); null leaves the cell empty. */
  bankName: string | null;
  bankAccountNumber: string | null;
  iban: string | null;
  net: Piastres;
}

/**
 * The bank sheet of an approved run (§6): one row per line — code, English name, Arabic name,
 * national ID, bank, account number, IBAN (an empty cell when missing) and net in EGP with 2
 * decimals — then a bold total row with the sum of the nets. Headers follow the caller's language.
 */
export async function buildBankSheet(
  rows: readonly BankSheetRow[],
  lang: Language,
): Promise<Buffer> {
  const t = LABELS[lang];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t.sheetName, {
    views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: t.code, key: 'code', width: 14 },
    { header: t.nameEn, key: 'nameEn', width: 32 },
    { header: t.nameAr, key: 'nameAr', width: 32 },
    { header: t.nationalId, key: 'nationalId', width: 18 },
    { header: t.bankName, key: 'bankName', width: 24 },
    { header: t.bankAccountNumber, key: 'bankAccountNumber', width: 22 },
    { header: t.iban, key: 'iban', width: 34 },
    { header: t.net, key: 'net', width: 16, style: { numFmt: NET_NUMBER_FORMAT } },
  ];
  sheet.getRow(1).font = { bold: true };
  let totalPiastres = 0;
  for (const row of rows) {
    totalPiastres += row.net;
    sheet.addRow({
      code: row.employeeCode,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      // Kept as text so a 14-digit ID or an account number never turns into a number; null leaves
      // the cell empty.
      nationalId: row.nationalId ?? null,
      bankName: row.bankName ?? null,
      bankAccountNumber: row.bankAccountNumber ?? null,
      iban: row.iban ?? null,
      // Integer piastres → EGP; piastres ÷ 100 is exact to 2 decimals for any whole number.
      net: row.net / 100,
    });
  }
  // Summed in piastres (exact), then shown in EGP like every row.
  const total = sheet.addRow({ code: t.total, net: totalPiastres / 100 });
  total.font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
