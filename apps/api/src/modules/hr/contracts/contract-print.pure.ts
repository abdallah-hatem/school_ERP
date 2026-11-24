import { createHash } from 'node:crypto';
import {
  CONTRACT_DOCUMENT_CSS,
  contractYearOf,
  escapeHtml,
  type ContractCopy,
  type ContractFieldKey,
  type ContractFieldValues,
  type ContractLanguage,
} from '@school-erp/shared';
import { toIsoDate } from '../../../common/utils/dates.util';
import type { CopyRow } from './repositories/contract-copies.repository';

/**
 * The hash a copy is made with (spec → "What you saw is what's kept"): the template version, the
 * language and the values of the fields the text uses. A value the text uses changing between the
 * preview and Print → 409; an unrelated edit (or today's date, when the text doesn't print it) doesn't.
 */
export function printValuesHash(input: {
  versionId: string;
  language: ContractLanguage;
  values: ContractFieldValues;
  fields: readonly ContractFieldKey[];
}): string {
  const keys = [...new Set(input.fields)].sort();
  const values = keys.map((k) => [k, input.values[k] ?? null]);
  return createHash('sha256').update(JSON.stringify([input.versionId, input.language, values])).digest('hex');
}

/** `2026` → `2026-27`. */
export function contractYearLabel(startsOn: string): string {
  const year = contractYearOf(startsOn);
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

/** Lower-case Latin words joined by dashes; never anything typed but the template's English name. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * The download name (spec → PDF, edge case 25): `<code>-<contract year>-<template>.pdf`, e.g.
 * `EMP-0006-2026-27-full-time-contract.pdf`. Built from the code, the year and the template's
 * English name reduced to `[a-z0-9-]`; the stored file's own name is random.
 */
export function copyDownloadName(code: string, startsOn: string, templateNameEn: string): string {
  const template = slug(templateNameEn) || 'contract';
  return `${code.replace(/[^A-Za-z0-9-]/g, '')}-${contractYearLabel(startsOn)}-${template}.pdf`;
}

/** A stored copy as the API returns it; `canOpen` false hides its file (a salary the reader can't see). */
export function toCopy(row: CopyRow, canOpen: boolean): ContractCopy {
  return {
    id: row.id,
    contractId: row.contractId,
    templateId: row.templateId,
    templateNameEn: row.templateNameEn,
    templateNameAr: row.templateNameAr,
    templateVersion: row.templateVersion.version,
    language: row.language,
    textEdited: row.textEdited,
    containsSalary: row.containsSalary,
    output: row.output,
    pageCount: row.pageCount,
    fileUrl: canOpen ? row.fileUrl : null,
    downloadName: copyDownloadName(row.employee.code, toIsoDate(row.contract.startsOn), row.templateNameEn),
    printedBy: { id: row.printedById, name: row.printedByName },
    printedAt: row.printedAt.toISOString(),
    // Reserved for the signed scan (contracts round 3): its own `signed_copy_id` points here.
    signed: false,
  };
}

/** The bundled fonts as `@font-face` rules (data URLs: the PDF page loads nothing). */
export interface PdfFonts {
  arabic400: string;
  arabic700: string;
  latin400: string;
  latin700: string;
}

const ARABIC_RANGE =
  'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';

export function fontFaces(fonts: PdfFonts): string {
  const face = (family: string, weight: number, src: string, range?: string) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(${src}) format('woff2');${range ? `unicode-range:${range};` : ''}}`;
  return [
    face('Contract Arabic', 400, fonts.arabic400, ARABIC_RANGE),
    face('Contract Arabic', 700, fonts.arabic700, ARABIC_RANGE),
    face('Contract Latin', 400, fonts.latin400),
    face('Contract Latin', 700, fonts.latin700),
  ].join('');
}

/** The whole page Chromium prints: our rendered document, our CSS and fonts, nothing external. */
export function contractPdfHtml(documentHtml: string, fonts: PdfFonts, language: ContractLanguage): string {
  const lang = language === 'AR' ? 'ar' : 'en';
  const dir = language === 'AR' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>${fontFaces(fonts)}html,body{margin:0;padding:0;background:#fff}${CONTRACT_DOCUMENT_CSS}</style></head><body>${documentHtml}</body></html>`;
}

/** Chromium's footer: "School name — template name · page N of M", in the copy's language. */
export function contractFooterTemplate(input: { schoolName: string; templateName: string; language: ContractLanguage; fonts: PdfFonts }): string {
  const ar = input.language === 'AR';
  const page = ar ? 'صفحة' : 'Page';
  const of = ar ? 'من' : 'of';
  const title = [input.schoolName, input.templateName].filter((t) => t.trim() !== '').map(escapeHtml).join(' — ');
  return `<style>${fontFaces(input.fonts)}</style><div dir="${ar ? 'rtl' : 'ltr'}" style="width:100%;margin:0 20mm;font-family:'Contract Latin','Contract Arabic',sans-serif;font-size:8pt;color:#5b6b66;display:flex;justify-content:space-between"><span>${title}</span><span>${page} <span class="pageNumber"></span> ${of} <span class="totalPages"></span></span></div>`;
}
