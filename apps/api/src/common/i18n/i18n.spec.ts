import { ERROR_CODES } from '@school-erp/shared';
import { resolveLanguage, translateError } from './i18n';

describe('resolveLanguage', () => {
  it.each([
    ['en', 'en'],
    ['ar', 'ar'],
    ['en-US,en;q=0.9', 'en'],
    ['ar-EG', 'ar'],
    ['fr-FR, en;q=0.5, ar;q=0.8', 'ar'],
    ['fr', 'ar'],
    ['', 'ar'],
    ['en;q=0, ar', 'ar'],
  ])('%j → %s', (header, lang) => {
    expect(resolveLanguage(header)).toBe(lang);
  });

  it('falls back to Arabic with no header', () => {
    expect(resolveLanguage(undefined)).toBe('ar');
  });
});

describe('translateError', () => {
  it('every error code reads differently in Arabic and English', () => {
    for (const code of ERROR_CODES) {
      const en = translateError(code, 'en');
      const ar = translateError(code, 'ar');
      expect(en).toBeTruthy();
      expect(ar).toBeTruthy();
      expect(ar).not.toBe(en);
    }
  });

  it('returns undefined for a code without a message', () => {
    expect(translateError('P2034', 'en')).toBeUndefined();
  });
});
