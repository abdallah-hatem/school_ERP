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
  net: Piastres;
}

/**
 * The bank sheet of an approved run (§6): one row per line — code, English name, Arabic name,
 * national ID (an empty cell when missing) and net in EGP with 2 decimals. Bank account fields
 * are Planned. Headers follow the caller's language.
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
    { header: t.net, key: 'net', width: 16, style: { numFmt: NET_NUMBER_FORMAT } },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      code: row.employeeCode,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      // Kept as text so a 14-digit ID never turns into a number; null leaves the cell empty.
      nationalId: row.nationalId ?? null,
      // Integer piastres → EGP; piastres ÷ 100 is exact to 2 decimals for any whole number.
      net: row.net / 100,
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
