import { describe, expect, it } from 'vitest';
import { brandingFrom } from './branding';

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
