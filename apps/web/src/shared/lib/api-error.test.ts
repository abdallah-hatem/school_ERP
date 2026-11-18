import arErrors from '@school-erp/shared/locales/ar/errors.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import { describe, expect, it } from 'vitest';
import { apiErrorText } from './api-error';
import { createTranslator, hasMessage, type MessageTree } from './i18n';

const i18nFor = (locale: 'en' | 'ar') => {
  const messages = { errors: locale === 'en' ? enErrors : arErrors } as unknown as MessageTree;
  return { t: createTranslator(messages, locale), has: (key: string) => hasMessage(messages, key) };
};

describe('apiErrorText', () => {
  it('a sign-in lock reads "Try again in N minutes" with the API params, in the right plural form', () => {
    const locked = (count: number) => ({ error: 'TOO_MANY_ATTEMPTS', message: 'x', params: { count } });
    expect(apiErrorText(locked(12), i18nFor('en'))).toBe('Too many attempts. Try again in 12 minutes.');
    expect(apiErrorText(locked(1), i18nFor('en'))).toBe('Too many attempts. Try again in 1 minute.');
    expect(apiErrorText(locked(2), i18nFor('ar'))).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد دقيقتين.');
    expect(apiErrorText(locked(5), i18nFor('ar'))).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد 5 دقائق.');
    expect(apiErrorText(locked(15), i18nFor('ar'))).toBe('محاولات كثيرة جدًا. حاول مرة أخرى بعد 15 دقيقة.');
  });

  it('a known code without params is its translation; an unknown one falls back to the API message', () => {
    expect(apiErrorText({ error: 'SAME_PASSWORD' }, i18nFor('en'))).not.toBe('');
    expect(apiErrorText({ error: 'P2034', message: 'Database request failed' }, i18nFor('en'))).toBe(
      'Database request failed',
    );
  });
});
