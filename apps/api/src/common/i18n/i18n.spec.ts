import { ERROR_CODES } from '@school-erp/shared';
import { resolveLanguage, translateError } from './i18n';

describe('resolveLanguage', () => {
  it.each([
    ['en', 'en'],
    ['ar', 'ar'],
    ['en-US,en;q=0.9', 'en'],
    ['ar-EG', 'ar'],
    ['fr-FR, en;q=0.5, ar;q=0.8', 'ar'],
    ['fr', 'en'],
    ['', 'en'],
    ['en;q=0, ar', 'ar'],
  ])('%j → %s', (header, lang) => {
    expect(resolveLanguage(header)).toBe(lang);
  });

  it('falls back to English with no header', () => {
    expect(resolveLanguage(undefined)).toBe('en');
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

  it('a message with plural forms picks the form for count (Arabic noun agreement)', () => {
    const t = (lang: 'en' | 'ar', count: number) =>
      translateError('TOO_MANY_ATTEMPTS', lang, { count });
    expect(t('en', 1)).toBe('Too many attempts. Try again in 1 minute.');
    expect(t('en', 15)).toBe('Too many attempts. Try again in 15 minutes.');
    expect(t('ar', 1)).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد دقيقة.');
    expect(t('ar', 2)).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد دقيقتين.');
    expect(t('ar', 7)).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد 7 دقائق.');
    expect(t('ar', 15)).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد 15 دقيقة.');
  });

  it('an ISO date param reads as a date in the language (PENALTY_EARLIER_PENDING)', () => {
    const params = { date: '2026-11-19' };
    expect(translateError('PENALTY_EARLIER_PENDING', 'en', params)).toBe(
      'Approve or cancel the 19 Nov 2026 penalty for this violation first.',
    );
    const ar = translateError('PENALTY_EARLIER_PENDING', 'ar', params);
    expect(ar).toContain('19');
    expect(ar).toContain('2026');
    expect(ar).not.toContain('2026-11-19');
  });

  it('an ISO instant param reads as the school date and a 12-hour time, never 24-hour', () => {
    const params = { date: '2026-11-19T14:07:00.000Z' };
    expect(translateError('PENALTY_EARLIER_PENDING', 'en', params)).toBe(
      'Approve or cancel the 19 Nov 2026, 4:07\u00a0PM penalty for this violation first.',
    );
    const ar = translateError('PENALTY_EARLIER_PENDING', 'ar', params);
    expect(ar).toContain('19 نوفمبر 2026، 4:07\u00a0م');
    expect(ar).not.toContain('16:07');
  });

  it('a month param (YYYY-MM) reads as the month and year (PENALTY_RECOUNT_MONTH_LOCKED)', () => {
    const params = { month: '2026-10' };
    expect(translateError('PENALTY_RECOUNT_MONTH_LOCKED', 'en', params)).toContain('in October 2026, whose payroll');
    const ar = translateError('PENALTY_RECOUNT_MONTH_LOCKED', 'ar', params);
    expect(ar).toContain('أكتوبر 2026');
    expect(ar).not.toContain('2026-10');
  });

  it('a count picks the plural form (PENALTY_RECOUNT_UNCONFIRMED)', () => {
    expect(translateError('PENALTY_RECOUNT_UNCONFIRMED', 'en', { count: 2 })).toBe(
      'Approving this penalty raises the level of 2 approved penalties. Check them and confirm.',
    );
    expect(translateError('PENALTY_RECOUNT_UNCONFIRMED', 'en', { count: 1 })).toContain('1 approved penalty.');
  });
});
