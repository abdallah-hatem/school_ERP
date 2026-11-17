/*
 * Client-side matching for short, fully loaded pick lists (a combobox's options) — never for paged
 * data, which the API searches. Case-, diacritic- and Arabic-letter-variant-insensitive, so "mona",
 * "Moná", "منى" / "مني" and "احمد" / "أحمد" all match what a person would expect.
 */

/** Arabic short vowels, shadda, sukun, tanween and the tatweel. */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;
/** Latin combining accents (after NFD). */
const LATIN_MARKS = /[\u0300-\u036f]/g;

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
