import { describe, expect, it } from 'vitest';
import { matchesSearch, searchKey } from '../src';

describe('search (the API’s in-memory searches and a picker’s own options)', () => {
  it('folds case, accents, Arabic marks and letter variants', () => {
    expect(searchKey('  Moná  HASSAN ')).toBe('mona hassan');
    expect(searchKey('أحمد')).toBe(searchKey('احمد'));
    expect(searchKey('منى')).toBe(searchKey('مني'));
    expect(searchKey('فاطمة')).toBe(searchKey('فاطمه'));
    expect(searchKey('مُحَمَّد')).toBe('محمد');
  });

  it('every word must appear in one of the texts; an empty query matches all', () => {
    expect(matchesSearch('mona emp-1', ['Mona Ali', 'منى علي', 'EMP-12'])).toBe(true);
    expect(matchesSearch('mona emp-9', ['Mona Ali', 'EMP-12'])).toBe(false);
    expect(matchesSearch('   ', ['anything'])).toBe(true);
  });
});
