import arEmployees from '@school-erp/shared/locales/ar/employees.json';
import arLateness from '@school-erp/shared/locales/ar/lateness.json';
import arSettings from '@school-erp/shared/locales/ar/settings.json';
import enSettings from '@school-erp/shared/locales/en/settings.json';
import { describe, expect, it } from 'vitest';
import {
  type MessageTree,
  createTranslator,
  dirFor,
  getBaseMessages,
  getCommonMessages,
  isLocale,
  localeFromPath,
  mergeMessages,
  requestLocale,
  swapLocaleInPath,
} from './i18n';

describe('i18n', () => {
  it('Arabic renders right-to-left, English left-to-right', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });

  it('accepts only the two supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  it('loads the shared common namespace for each locale', () => {
    expect(getCommonMessages('en').nav.payroll).toBe('Payroll');
    expect(getCommonMessages('ar').nav.payroll).not.toBe(getCommonMessages('en').nav.payroll);
  });

  it('translates nested keys with values, and shows a missing key as itself', () => {
    const t = createTranslator(getBaseMessages('en'));
    expect(t('ui.table.showing', { from: 1, to: 10, total: 14 })).toBe('Showing 1–10 of 14');
    expect(t('common.nav.payroll')).toBe('Payroll');
    expect(t('ui.nope')).toBe('ui.nope');
  });

  it('picks the plural form for count by the locale (English one/other, Arabic six forms)', () => {
    const forms = { zero: 'z', one: 'one {count}', two: 'two', few: '{count} few', many: '{count} many', other: '{count} other' };
    const en = createTranslator({ x: { n: { ...forms } } }, 'en');
    expect(en('x.n', { count: 1 })).toBe('one 1');
    expect(en('x.n', { count: 0 })).toBe('0 other');
    expect(en('x.n', { count: '1,284' })).toBe('1,284 other');
    const ar = createTranslator({ x: { n: { ...forms } } }, 'ar');
    expect([0, 1, 2, 5, 11, 100].map((count) => ar('x.n', { count }))).toEqual([
      'z',
      'one 1',
      'two',
      '5 few',
      '11 many',
      '100 other',
    ]);
    // No count: the "other" form.
    expect(ar('x.n')).toBe('{count} other');
  });

  it('Arabic counts agree with their noun in every plural category (dry run 2026-11-18)', () => {
    const counts = [1, 2, 3, 10, 11, 100];
    const ar = createTranslator(
      { settings: arSettings, employees: arEmployees, lateness: arLateness } as unknown as MessageTree,
      'ar',
    );
    // one, two, few (3–10), many (11–99), other (100).
    expect(counts.map((count) => ar('settings.catalogue.violationCount', { count }))).toEqual([
      'مخالفة واحدة',
      'مخالفتان',
      '3 مخالفات',
      '10 مخالفات',
      '11 مخالفة',
      '100 مخالفة',
    ]);
    expect(counts.map((count) => ar('employees.list.count', { count }))).toEqual([
      'موظف واحد',
      'موظفان',
      '3 موظفين',
      '10 موظفين',
      '11 موظفًا',
      '100 موظف',
    ]);
    expect(ar('employees.list.count', { count: 0 })).toBe('لا موظفين');
    // The lateness summary's own copy: "38 موظفًا", not "38 موظف".
    expect(ar('lateness.summaryEmployees', { count: 38 })).toBe('38 موظفًا');
    // From 100 the last two digits decide: 103 → few, 111 → many.
    expect(ar('settings.catalogue.violationCount', { count: '1,103' })).toBe('1,103 مخالفات');
    expect(ar('settings.catalogue.violationCount', { count: 111 })).toBe('111 مخالفة');

    const en = createTranslator({ settings: enSettings } as unknown as MessageTree, 'en');
    expect([1, 2, 11].map((count) => en('settings.catalogue.violationCount', { count }))).toEqual([
      '1 violation',
      '2 violations',
      '11 violations',
    ]);
  });

  it('lets a module add its namespace on top of the base ones', () => {
    const t = createTranslator(mergeMessages(getBaseMessages('en'), { hr: { title: 'HR' } }));
    expect(t('hr.title')).toBe('HR');
    expect(t('common.nav.payroll')).toBe('Payroll');
  });

  it('swaps only the locale segment of a path', () => {
    expect(swapLocaleInPath('/en/payroll/2026-11', 'ar')).toBe('/ar/payroll/2026-11');
    expect(swapLocaleInPath('/ar', 'en')).toBe('/en');
    expect(swapLocaleInPath('/', 'ar')).toBe('/ar');
    expect(swapLocaleInPath('/employees', 'en')).toBe('/en/employees');
  });

  it('API language follows the page locale, not the lang cookie', () => {
    // An English page whose cookie still says Arabic (another tab switched it) asks in English.
    expect(requestLocale({ pathname: '/en/payroll?month=2026-11', cookie: 'ar' })).toBe('en');
    expect(requestLocale({ pathname: '/ar/settings', cookie: 'en' })).toBe('ar');
    // A Server Action with no forwarded path falls back to the page it was called from.
    expect(requestLocale({ referer: 'http://localhost:3000/en/employees/1', cookie: 'ar' })).toBe(
      'en',
    );
    // No page locale at all → the cookie, then Arabic.
    expect(requestLocale({ pathname: '/api/auth/refresh', cookie: 'en' })).toBe('en');
    expect(requestLocale({})).toBe('en');
    expect(localeFromPath('/fr/x')).toBeNull();
  });
});
