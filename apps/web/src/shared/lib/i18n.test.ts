import { describe, expect, it } from 'vitest';
import { dirFor, getCommonMessages, isLocale } from './i18n';

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
});
