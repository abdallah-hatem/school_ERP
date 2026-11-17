import { describe, expect, it } from 'vitest';
import { brandingFrom, titleTemplateFor } from './branding';

const fallback = { nameEn: 'School ERP', nameAr: 'نظام المدرسة' };

describe('brandingFrom', () => {
  it('falls back to the plain product name and no logo when settings are missing (404 / API down)', () => {
    expect(brandingFrom(null, fallback)).toEqual({ ...fallback, logoUrl: null });
  });

  it('uses the school name and logo from settings', () => {
    expect(
      brandingFrom({ nameEn: 'Nile School', nameAr: 'مدرسة النيل', logoUrl: '/files/logo.png' }, fallback),
    ).toEqual({ nameEn: 'Nile School', nameAr: 'مدرسة النيل', logoUrl: '/files/logo.png' });
  });

  it('uses the other language when one name is blank', () => {
    expect(brandingFrom({ nameEn: '  ', nameAr: 'مدرسة النيل', logoUrl: null }, fallback).nameEn).toBe('مدرسة النيل');
  });
});

describe('titleTemplateFor', () => {
  const school = brandingFrom({ nameEn: 'Nile School', nameAr: 'مدرسة النيل', logoUrl: null }, fallback);

  it('"<page> · <school name>" in the current language', () => {
    expect(titleTemplateFor(school, 'en')).toEqual({ template: '%s · Nile School', default: 'Nile School' });
    expect(titleTemplateFor(school, 'ar')).toEqual({ template: '%s · مدرسة النيل', default: 'مدرسة النيل' });
  });

  it('falls back to the product name when the school settings are missing', () => {
    expect(titleTemplateFor(brandingFrom(null, fallback), 'ar').template).toBe('%s · نظام المدرسة');
  });
});
