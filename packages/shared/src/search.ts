/*
 * The one text fold for every search. `searchKey` is the JS twin of the database's
 * `search_fold(text)` (migration 20261122100000_search_fold): the API folds a typed query with it
 * and the database folds the searched columns with `search_fold` into generated `search_text` /
 * `search_compact` columns (docs/ARCHITECTURE.md → Search). The two must give the same result for
 * every string — the API e2e spec `search-fold.e2e-spec.ts` runs `SEARCH_FIXTURE` through both.
 *
 * `matchesSearch` is for searches the API runs over rows it has already worked out in memory (a
 * month's lateness, the penalty catalogue) and for a picker's own short option list. The browser
 * never searches a list of records with it (owner, 2026-11-21): the API does.
 */

/** Latin combining accents (after NFD), Arabic marks U+064B–U+0670 (incl. U+065F), the tatweel. */
const MARKS = /[\u0300-\u036F\u064B-\u0670\u0640]/g;
/** Zero-width characters: ZWSP, ZWNJ, ZWJ, LRM, RLM and the BOM. Dropped, not spaced. */
const ZERO_WIDTH = /[\u200B-\u200F\uFEFF]/g;
/**
 * Every whitespace-like character becomes one space: tab, newline, VT, FF, CR, space, NBSP, the
 * Ogham space, U+2000–U+200A, line / paragraph separators, narrow NBSP, the math and ideographic
 * spaces. Spelled out (not `\s`, which also counts the BOM) so it is the same set as the SQL fold's.
 */
const SPACES = /[\t\n\v\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;

/** A search key for `text`: lower-cased, marks removed, Arabic letter variants folded, spaces tidied. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(ZERO_WIDTH, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(SPACES, ' ')
    .trim();
}

/** A folded query: its words, and the whole of it with no spaces. */
export interface SearchTerms {
  words: string[];
  compact: string;
}

/**
 * The matching rule, shared by the database search and `matchesSearch`: a text matches when every
 * word is in it (any order, partial words), or when the query without spaces is in the text without
 * spaces — so "عبد الرحمن" / "عبدالرحمن" and "Abdel Rahman" / "Abdelrahman" find each other. Null
 * when nothing is left of the query (no search).
 */
export function searchTerms(query: string | null | undefined): SearchTerms | null {
  const key = searchKey(query ?? '');
  if (!key) return null;
  return { words: key.split(' '), compact: key.replace(/ /g, '') };
}

/** True when `query` matches one of `texts` by the rule above (an empty query matches everything). */
export function matchesSearch(query: string, texts: readonly string[]): boolean {
  const terms = searchTerms(query);
  if (!terms) return true;
  const haystack = texts.map(searchKey).join(' ');
  return (
    terms.words.every((word) => haystack.includes(word)) ||
    haystack.replace(/ /g, '').includes(terms.compact)
  );
}

/**
 * Tricky strings for both folds: this package's unit tests, the API's SQL parity check
 * (`search_fold` must equal `searchKey` on every one of `strings`) and its search e2e.
 * `same`: pairs that fold to the same key. `matches` / `misses`: [stored name, typed query] pairs a
 * search must find / must not find.
 */
export const SEARCH_FIXTURE = {
  same: [
    ['أحمد', 'احمد'],
    ['إسلام', 'اسلام'],
    ['آمنة', 'امنة'],
    ['فاطمة', 'فاطمه'],
    ['منى', 'مني'],
    ['مؤمن', 'مومن'],
    ['هيئة', 'هييه'],
    ['مُحَمَّد', 'محمد'],
    ['محـمد', 'محمد'],
    ['ٱلله', 'الله'],
    ['Moná', 'mona'],
    ['  Mona \u00A0\t Ali\n', 'mona ali'],
    ['Mo\u200Bna\uFEFF', 'mona'],
    ['أحمد\u200F علي', 'احمد علي'],
  ],
  strings: [
    'أحمد',
    'إسلام',
    'آمنة',
    'فاطمة',
    'منى',
    'مؤمن',
    'هيئة',
    'مُحَمَّد',
    'محـمد',
    'ٱلله',
    'عبد الرحمن',
    'عبدالرحمن',
    'أبو بكر',
    'أبوبكر',
    'Abdel Rahman',
    'Abdelrahman',
    'Moná Hassán',
    'ÉCOLE Ñandú Çağrı',
    'Zoë Ångström',
    '  extra   spaces  ',
    'nbsp\u00A0here',
    'tab\there\nnew\r\nline\v\f',
    'zero\u200Bwidth\u200C\u200D\u200E\u200F\uFEFF',
    '\u2003em\u3000space\u202Fnarrow\u2028sep',
    '50% off',
    'a_b',
    'back\\slash',
    'EMP-001',
    'ريم-٠٠١',
    '',
    '   ',
  ],
  matches: [
    ['أحمد علي', 'احمد'],
    ['احمد علي', 'أحمد'],
    ['إسلام محمود', 'اسلام'],
    ['آمنة سالم', 'امنة'],
    ['فاطمة حسن', 'فاطمه'],
    ['فاطمه حسن', 'فاطمة'],
    ['منى صالح', 'مني'],
    ['مني صالح', 'منى'],
    ['مؤمن خالد', 'مومن'],
    ['هيئة التدريس', 'هييه'],
    ['مُحَمَّد سعيد', 'محمد'],
    ['محـمد سعيد', 'محمد سعيد'],
    ['عبد الرحمن يوسف', 'عبدالرحمن'],
    ['عبدالرحمن يوسف', 'عبد الرحمن'],
    ['أبو بكر طارق', 'ابوبكر'],
    ['أبوبكر طارق', 'أبو بكر'],
    ['Abdel Rahman Yousef', 'Abdelrahman'],
    ['Abdelrahman Yousef', 'abdel rahman'],
    ['أحمد علي', '  علي \u00A0 احمد\u200B '],
    ['Mohamed Abdelaziz', 'moh aziz'],
    ['Moná Hassan', 'mona'],
    ['Mona Hassan', 'MONÁ'],
    ['Sale 50% Club', '50%'],
    ['a_b team', 'a_b'],
  ],
  misses: [
    ['Sale 50 Club', '50%'],
    ['axb team', 'a_b'],
    ['أحمد علي', 'احمد سالم'],
    ['Mona Hassan', 'monb'],
  ],
} as const;
