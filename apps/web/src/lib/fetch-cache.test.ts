import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withCachePolicy } from './fetch-cache';

/*
 * Security review (2026-11-23), the cache check: no answer fetched with someone's session is kept
 * by Next's data cache, where another user's render could be handed it.
 */

describe('withCachePolicy — an authenticated API fetch is never cached across users', () => {
  it('a request with a session is no-store, keeping its tags and dropping any revalidate', () => {
    expect(withCachePolicy({ next: { tags: ['users'] } }, true)).toEqual({ cache: 'no-store', next: { tags: ['users'] } });
    expect(withCachePolicy({ cache: 'force-cache', next: { tags: ['t'], revalidate: 3600 } }, true)).toEqual({
      cache: 'no-store',
      next: { tags: ['t'] },
    });
    expect(withCachePolicy({ method: 'GET' } as { method: string; cache?: RequestCache }, true)).toEqual({ method: 'GET', cache: 'no-store' });
  });

  it('a public request (no session) keeps what it asked for', () => {
    const icon = { cache: 'force-cache' as const };
    expect(withCachePolicy(icon, false)).toBe(icon);
    const school = { next: { tags: ['school-settings'] } };
    expect(withCachePolicy(school, false)).toBe(school);
  });
});

describe('guard: nothing opts the app into a shared cache behind apiFetch’s back', () => {
  const WEB = join(__dirname, '..', '..');
  const SRC = join(WEB, 'src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

  it('apiFetch applies the policy to every request', () => {
    expect(readFileSync(join(SRC, 'lib', 'api.ts'), 'utf8')).toMatch(/withCachePolicy\(options, !!headers\.Authorization\)/);
  });

  it('no `use cache`, `unstable_cache`, route `revalidate` / `fetchCache`, and no cacheComponents in next.config', () => {
    const offenders = files(SRC).filter((path) =>
      /['"]use cache['"]|unstable_cache|export const (revalidate|fetchCache)\b/.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
    expect(readFileSync(join(WEB, 'next.config.ts'), 'utf8')).not.toMatch(/cacheComponents|useCache|dynamicIO/);
  });

  it('every fetch() against the API goes through apiFetch (lib/api.ts) — none sets its own cache', () => {
    const direct = files(SRC).filter((path) => {
      const text = readFileSync(path, 'utf8');
      return /\bfetch\(\s*(?:`\$\{|baseURL|process\.env\.BASE_URL|fullUrl)/.test(text) && !path.endsWith(join('lib', 'api.ts'));
    });
    // middlewareFunctions refreshes the session (a POST, never cached).
    expect(direct.filter((p) => !p.endsWith('middlewareFunctions.ts'))).toEqual([]);
  });
});
