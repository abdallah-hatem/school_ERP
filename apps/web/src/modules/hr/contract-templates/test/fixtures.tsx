import type { ContractDocument, ContractTemplateSummary, SessionUser } from '@school-erp/shared';
import type { ReactElement } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { renderWithI18n, TEST_SESSION } from '@/test/render';
import { ContractTemplatesI18n } from '../messages';

/** Test data for the contract templates screens. */

export function summary(overrides: Partial<ContractTemplateSummary> = {}): ContractTemplateSummary {
  return {
    id: 't-1',
    nameEn: 'Full-time contract',
    nameAr: 'عقد عمل بدوام كامل',
    hasEnglish: false,
    defaultForWorkSystem: 'FULL_TIME',
    hidden: false,
    version: 3,
    usesSalary: true,
    updatedAt: '2026-11-18T13:05:00.000Z',
    updatedBy: { id: 'u-1', name: 'Mona Ibrahim' },
    ...overrides,
  };
}

/** A short Arabic text: a heading, a sentence with two fields, an optional phrase. */
export const sampleDocument: ContractDocument = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [{ type: 'text', text: 'عقد عمل محدد المدة' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'السيد/السيدة ' },
        { type: 'field', attrs: { key: 'employee.nameAr' } },
        { type: 'text', text: '، الرقم القومي ' },
        { type: 'field', attrs: { key: 'employee.nationalId' } },
        { type: 'optional', content: [{ type: 'text', text: '، بالمرحلة ' }, { type: 'field', attrs: { key: 'employee.stage' } }] },
      ],
    },
  ],
};

/** Render with the `contractTemplates` + `errors` namespaces, like the routes do. */
export function renderTemplates(ui: ReactElement, locale: Locale = 'en', session: SessionUser = TEST_SESSION) {
  return renderWithI18n(<ContractTemplatesI18n locale={locale}>{ui}</ContractTemplatesI18n>, { locale, session });
}

export const ok = <T,>(data: T, meta?: { total: number; page: number; limit: number }) =>
  ({ success: true, status: 200, data, ...(meta ? { meta } : {}) }) as never;

export const failure = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  ({ success: false, status, error, message: 'Server message', ...extra }) as never;
