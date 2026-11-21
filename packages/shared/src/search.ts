/*
 * The one text matcher for searches the API runs over rows it has already worked out in memory (a
 * month's lateness, the penalty catalogue) — and for a picker's own short option list. Case-,
 * diacritic- and Arabic-letter-variant-insensitive, so "mona", "Moná", "منى" / "مني" and
 * "احمد" / "أحمد" all match what a person would expect. The browser never searches a list of
 * records with it (owner, 2026-11-21): the API does.
 */

/** Arabic short vowels, shadda, sukun, tanween and the tatweel. */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
/** Latin combining accents (after NFD). */
const LATIN_MARKS = /[̀-ͯ]/g;

/** A search key for `text`: lower-cased, marks removed, Arabic letter variants folded. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(LATIN_MARKS, '')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of `query` appears in one of `texts` (an empty query matches everything). */
export function matchesSearch(query: string, texts: readonly string[]): boolean {
  const words = searchKey(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.map(searchKey).join(' ');
  return words.every((word) => haystack.includes(word));
}
