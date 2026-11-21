import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SKELETON_ROUTES, SKELETON_SCREENS } from '../../e2e/support/skeleton-screens';

/*
 * Guard: every route with a `loading.tsx` is compared by the skeleton spec (e2e/23-skeletons*).
 * The Approved payroll pages (#171) had a `loading.tsx` but no entry in the spec, so their
 * skeleton header lost its buttons and status pill without CI noticing (owner, 2026-11-21). A new
 * `loading.tsx` must be listed in `SKELETON_ROUTES` (e2e/support/skeleton-screens.ts) with the
 * screens that show it — or, rarely, an exemption that says why.
 */
const APP = fileURLToPath(new URL('../app', import.meta.url));
/** Routes are listed by their folder under the signed-in layout. */
const DASHBOARD = join('[locale]', '(dashboard)');

function loadingFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return loadingFiles(path);
    return entry.name === 'loading.tsx' ? [path] : [];
  });
}

/** `src/app/[locale]/(dashboard)/payroll/[id]/loading.tsx` → `payroll/[id]`; elsewhere its path under `src/app`. */
function routeOf(file: string): string {
  const folder = relative(APP, join(file, '..'));
  const route = folder === DASHBOARD ? '' : folder.startsWith(DASHBOARD + sep) ? folder.slice(DASHBOARD.length + 1) : folder;
  return route.split(sep).join('/');
}

describe('skeleton coverage', () => {
  const routes = loadingFiles(APP).map(routeOf).sort();

  it('finds the route skeletons', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain('accounting/payroll/[month]');
  });

  it('lists every loading.tsx in SKELETON_ROUTES, so the skeleton spec compares it', () => {
    const missing = routes.filter((r) => !(r in SKELETON_ROUTES));
    expect(missing, `add these routes to SKELETON_ROUTES (e2e/support/skeleton-screens.ts) and their screens to SKELETON_SCREENS: ${missing.join(', ')}`).toEqual([]);
  });

  it('lists no route that has no loading.tsx any more', () => {
    const stale = Object.keys(SKELETON_ROUTES).filter((r) => !routes.includes(r));
    expect(stale).toEqual([]);
  });

  it('names only screens the spec runs, at least one per route unless exempt with a reason', () => {
    const known = new Set<string>(SKELETON_SCREENS);
    for (const [route, screens] of Object.entries(SKELETON_ROUTES)) {
      if ('exempt' in screens) {
        expect(screens.exempt.trim().length, `${route}: an exemption says why`).toBeGreaterThan(10);
        continue;
      }
      expect(screens.length, `${route}: no screen covers it`).toBeGreaterThan(0);
      for (const s of screens) expect(known.has(s), `${route}: "${s}" isn't in SKELETON_SCREENS`).toBe(true);
    }
  });
});
