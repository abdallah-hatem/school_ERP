/*
 * The penalty catalogue's search is the API's (`GET /hr/penalty-groups?search`, owner 2026-11-21);
 * here only the highlight of what was typed in the names it answered with.
 */

/**
 * `text` split around the first plain (case-insensitive) occurrence of the query, for a cheap
 * highlight: `[before, match, after]`, or null when the query doesn't appear as typed (a match
 * found only through letter folding, e.g. "احمد" for "أحمد", is shown without a highlight).
 */
export function highlightParts(text: string, query: string): [string, string, string] | null {
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q) return null;
  const at = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (at < 0) return null;
  return [text.slice(0, at), text.slice(at, at + q.length), text.slice(at + q.length)];
}
