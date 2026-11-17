import type { PenaltyGroup } from '@school-erp/shared';
import { matchesSearch } from '@/shared/lib/search';

/*
 * Searching the penalty catalogue (§7). The catalogue loads whole, so it is filtered in the browser
 * with the shared matcher (case-, mark- and Arabic-letter-variant-insensitive).
 */

export interface CatalogueMatch {
  group: PenaltyGroup;
  /** The group's own name matched: all its violations are shown. */
  groupMatched: boolean;
}

/**
 * The groups that match `query`, each with only its matching violations: a violation matches by
 * its English or Arabic name; a group whose English or Arabic name matches keeps every violation.
 * Groups with nothing matching are left out. An empty query returns every group as it is.
 */
export function searchCatalogue(groups: readonly PenaltyGroup[], query: string): CatalogueMatch[] {
  if (!query.trim()) return groups.map((group) => ({ group, groupMatched: false }));
  const matches: CatalogueMatch[] = [];
  for (const group of groups) {
    if (matchesSearch(query, [group.nameEn, group.nameAr])) {
      matches.push({ group, groupMatched: true });
      continue;
    }
    const violations = group.violations.filter((v) => matchesSearch(query, [v.nameEn, v.nameAr]));
    if (violations.length > 0) matches.push({ group: { ...group, violations }, groupMatched: false });
  }
  return matches;
}

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
