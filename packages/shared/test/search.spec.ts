import { describe, expect, it } from 'vitest';
import { matchesSearch, SEARCH_FIXTURE, searchKey, searchTerms } from '../src';

describe('searchKey (the JS twin of the database search_fold)', () => {
  it('folds case, accents, Arabic marks and letter variants', () => {
    expect(searchKey('  Moná  HASSAN ')).toBe('mona hassan');
    expect(searchKey('مُحَمَّد')).toBe('محمد');
    expect(searchKey('ÉCOLE Ñandú')).toBe('ecole nandu');
  });

  it.each(SEARCH_FIXTURE.same)('%j folds like %j', (a, b) => {
    expect(searchKey(a)).toBe(searchKey(b));
  });

  it('turns every whitespace-like character into one space and drops zero-width ones', () => {
    expect(searchKey('tab\there\nnew\r\nline')).toBe('tab here new line');
    expect(searchKey('a\u00A0\u2003\u3000\u202Fb')).toBe('a b');
    expect(searchKey('zero\u200Bwidth\u200C\u200D\u200E\u200F\uFEFF')).toBe('zerowidth');
    expect(searchKey('\uFEFF  \u200B ')).toBe('');
  });

  it('every fixture string folds to a trimmed key with single spaces only', () => {
    for (const s of SEARCH_FIXTURE.strings) {
      const key = searchKey(s);
      expect(key).toBe(key.trim());
      expect(key).not.toMatch(/ {2}|[\t\n\r\v\f\u00A0\u200B-\u200F\uFEFF]/);
    }
  });
});

describe('searchTerms', () => {
  it('splits the folded query into words plus the query without spaces', () => {
    expect(searchTerms(' عبد  الرحمن ')).toEqual({ words: ['عبد', 'الرحمن'], compact: 'عبدالرحمن' });
    expect(searchTerms('Abdel\u00A0Rahman')).toEqual({ words: ['abdel', 'rahman'], compact: 'abdelrahman' });
  });

  it('is null when nothing is left of the query', () => {
    expect(searchTerms('')).toBeNull();
    expect(searchTerms('  \u200B\u00A0 ')).toBeNull();
    expect(searchTerms(undefined)).toBeNull();
  });
});

describe('matchesSearch (in-memory searches and a picker’s own options)', () => {
  it.each(SEARCH_FIXTURE.matches)('%j is found by %j', (stored, query) => {
    expect(matchesSearch(query, [stored])).toBe(true);
  });

  it.each(SEARCH_FIXTURE.misses)('%j is not found by %j', (stored, query) => {
    expect(matchesSearch(query, [stored])).toBe(false);
  });

  it('every word must appear in one of the texts; an empty query matches all', () => {
    expect(matchesSearch('mona emp-1', ['Mona Ali', 'منى علي', 'EMP-12'])).toBe(true);
    expect(matchesSearch('mona emp-9', ['Mona Ali', 'EMP-12'])).toBe(false);
    expect(matchesSearch('   ', ['anything'])).toBe(true);
  });
});
