import { Prisma } from '@prisma/client';
import { searchTerms } from '@school-erp/shared';

/*
 * The one database search (docs/ARCHITECTURE.md → Search). Every searched table has two generated
 * columns the database keeps up to date: `search_text` (search_fold of its searched columns) and
 * `search_compact` (the same without spaces), each with a trigram index. A typed query is folded
 * with the same rules (`searchKey`) and a row matches when every word of it is in `search_text`, or
 * the query without spaces is in `search_compact`. Never write these columns.
 */

/** `%`, `_` and `\` in a typed query are literal (LIKE's default escape is the backslash). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The where fragment of a model with the two search columns (Employee, User, Role, …). */
export interface SearchWhere {
  OR: (
    | { AND: { searchText: { contains: string } }[] }
    | { searchCompact: { contains: string } }
  )[];
}

/**
 * The search as a Prisma where fragment for one model, or undefined for an empty query. Nest it
 * under a relation for a search through one (`{ employee: searchWhere(q) }`). Case is already
 * folded on both sides, so it is a plain (trigram-indexed) LIKE.
 */
export function searchWhere(query: string | null | undefined): SearchWhere | undefined {
  const terms = searchTerms(query);
  if (!terms) return undefined;
  const compact = { searchCompact: { contains: escapeLike(terms.compact) } };
  // One word: "in search_text" implies "in search_compact", so the compact check alone is the rule.
  if (terms.words.length === 1) return { OR: [compact] };
  return {
    OR: [{ AND: terms.words.map((w) => ({ searchText: { contains: escapeLike(w) } })) }, compact],
  };
}

/**
 * The same rule over any text expression in raw SQL (e.g. a subquery's column, which has no
 * generated columns): `TRUE` for an empty query. Not indexed — for small sets only.
 */
export function searchSql(expr: Prisma.Sql, query: string | null | undefined): Prisma.Sql {
  const terms = searchTerms(query);
  if (!terms) return Prisma.sql`TRUE`;
  const like = (s: string) => `%${escapeLike(s)}%`;
  const words = Prisma.join(terms.words.map((w) => Prisma.sql`search_fold(${expr}) LIKE ${like(w)}`), ' AND ');
  return Prisma.sql`((${words}) OR replace(search_fold(${expr}), ' ', '') LIKE ${like(terms.compact)})`;
}

/**
 * `searchWhere`'s rule in raw SQL on a table's two generated columns (`<alias>.search_text`,
 * `<alias>.search_compact`) — trigram-indexed like the Prisma form. For a list whose order Prisma
 * can't express (the renewal list's "needs action first"). `TRUE` for an empty query. `alias` is
 * code, never user input.
 */
export function searchColumnsSql(alias: string, query: string | null | undefined): Prisma.Sql {
  const terms = searchTerms(query);
  if (!terms) return Prisma.sql`TRUE`;
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error(`searchColumnsSql: bad alias "${alias}"`);
  const like = (s: string) => `%${escapeLike(s)}%`;
  const text = Prisma.raw(`${alias}."search_text"`);
  const compact = Prisma.raw(`${alias}."search_compact"`);
  const compactMatch = Prisma.sql`${compact} LIKE ${like(terms.compact)}`;
  if (terms.words.length === 1) return compactMatch;
  const words = Prisma.join(terms.words.map((w) => Prisma.sql`${text} LIKE ${like(w)}`), ' AND ');
  return Prisma.sql`((${words}) OR ${compactMatch})`;
}

/**
 * A code search ("EMP-0" finds EMP-001), any case, `%` / `_` literal: the Activity log's look-up of
 * records by code. Codes are not names, so this is a plain contains on the code column.
 */
export function codeContains(query: string): { contains: string; mode: 'insensitive' } {
  return { contains: escapeLike(query.trim()), mode: 'insensitive' };
}
