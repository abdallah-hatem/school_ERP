import type { ContractDocument } from '@school-erp/shared';
import { languagesOf, textChanged, versionFacts } from './contract-templates.pure';

const doc = (...keys: string[]): ContractDocument =>
  ({ type: 'doc', content: [{ type: 'paragraph', content: keys.map((key) => ({ type: 'field', attrs: { key } })) }] }) as ContractDocument;

describe('versionFacts', () => {
  it('a salary field in either language marks the version as using the salary', () => {
    expect(versionFacts(doc('employee.code'), null)).toEqual({ usesSalary: false, fields: ['employee.code'] });
    expect(versionFacts(doc('employee.code'), doc('contract.salaryWords'))).toEqual({
      usesSalary: true,
      fields: ['employee.code', 'contract.salaryWords'],
    });
  });
});

describe('textChanged', () => {
  it('a change in either text is a new version; the same texts are not', () => {
    const before = { bodyAr: doc('today'), bodyEn: null };
    expect(textChanged(before, { bodyAr: doc('today'), bodyEn: null })).toBe(false);
    expect(textChanged(before, { bodyAr: doc('employee.code'), bodyEn: null })).toBe(true);
    expect(textChanged(before, { bodyAr: doc('today'), bodyEn: doc('today') })).toBe(true);
  });
});

describe('languagesOf', () => {
  it('reads AR or AR+EN for the audit entry', () => {
    expect(languagesOf({ hasEnglish: false })).toBe('AR');
    expect(languagesOf({ hasEnglish: true })).toBe('AR+EN');
  });
});
