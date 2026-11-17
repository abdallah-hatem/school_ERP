import { describe, expect, it } from 'vitest';
import {
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
    expect(requestLocale({})).toBe('ar');
    expect(localeFromPath('/fr/x')).toBeNull();
  });
});
