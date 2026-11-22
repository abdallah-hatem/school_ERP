import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Prisma } from '@prisma/client';
import { codeContains, escapeLike, searchSql, searchWhere } from './search';

describe('escapeLike', () => {
  it('makes %, _ and \\ literal', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('searchWhere (the shared database search)', () => {
  it('is undefined for an empty or blank query', () => {
    expect(searchWhere(undefined)).toBeUndefined();
    expect(searchWhere('')).toBeUndefined();
    expect(searchWhere(' \u00A0\u200B ')).toBeUndefined();
  });

  it('one word: contained in search_compact (which covers search_text), folded and escaped', () => {
    expect(searchWhere('  أحمد ')).toEqual({ OR: [{ searchCompact: { contains: 'احمد' } }] });
    expect(searchWhere('50%')).toEqual({ OR: [{ searchCompact: { contains: '50\\%' } }] });
  });

  it('several words: every word in search_text, or the joined query in search_compact', () => {
    expect(searchWhere('Abdel  Rahman')).toEqual({
      OR: [
        { AND: [{ searchText: { contains: 'abdel' } }, { searchText: { contains: 'rahman' } }] },
        { searchCompact: { contains: 'abdelrahman' } },
      ],
    });
  });
});

describe('searchSql', () => {
  it('is TRUE for an empty query', () => {
    expect(searchSql(Prisma.sql`x`, ' ').sql).toBe('TRUE');
  });

  it('folds the expression and binds escaped patterns', () => {
    const q = searchSql(Prisma.sql`latest.name`, 'علي a_b');
    expect(q.sql).toBe(
      "((search_fold(latest.name) LIKE ? AND search_fold(latest.name) LIKE ?) OR replace(search_fold(latest.name), ' ', '') LIKE ?)",
    );
    expect(q.values).toEqual(['%علي%', '%a\\_b%', '%عليa\\_b%']);
  });
});

describe('codeContains', () => {
  it('a trimmed, escaped, case-insensitive contains', () => {
    expect(codeContains(' emp_1 ')).toEqual({ contains: 'emp\\_1', mode: 'insensitive' });
  });
});

/** Every .ts file under `dir`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('the generated search columns are never written by the app', () => {
  it('only the shared helper and the client set-up name them', () => {
    const root = join(__dirname, '..', '..');
    const allowed = ['common/repositories/search.ts', 'database/database.service.ts'];
    const offenders = sources(root)
      .map((path) => relative(root, path))
      .filter((path) => !allowed.includes(path))
      .filter((path) => /\bsearch(Text|Compact)\b|search_(text|compact)/.test(readFileSync(join(root, path), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
