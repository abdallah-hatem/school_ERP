import {
  BUILT_IN_ROLES,
  SCREENS,
  SCREEN_IDS,
  SETTINGS_SECTION_ACCESS,
  SIDEBAR_SCREENS,
  canOpenScreen,
  visibleSettingsSections,
} from '@school-erp/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/core/navigation/nav-items';

/*
 * `SCREENS` (@school-erp/shared) is the one list of who may open each page: the page guards, the
 * sidebar and the role-access smoke spec (e2e/24-role-access.spec.ts) all read it. These checks
 * keep the pages on it — a new page without `requireScreen`, or one guarding with another
 * screen's entry, fails here instead of drifting from the sidebar and the smoke matrix.
 */

const DASHBOARD = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', '[locale]', '(dashboard)');

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'page.tsx' || entry.name === 'layout.tsx' ? [path] : [];
  });
}

/** `employees/[id]/(profile)/payroll/page.tsx` → `/employees/:id/payroll`. */
function routeOf(file: string): string {
  const segments = relative(DASHBOARD, dirname(file))
    .split(sep)
    .filter((s) => s && !(s.startsWith('(') && s.endsWith(')')))
    .map((s) => (s.startsWith('[') && s.endsWith(']') ? `:${s.slice(1, -1)}` : s));
  return segments.length ? `/${segments.join('/')}` : '';
}

const guardIn = (file: string) => readFileSync(file, 'utf8').match(/requireScreen\('([A-Za-z]+)'\)/)?.[1];
const files = routeFiles(DASHBOARD);

describe('SCREENS — the page guards', () => {
  it('every page under (dashboard) guards with the SCREENS entry for its own route', () => {
    const problems: string[] = [];
    for (const file of files) {
      const route = routeOf(file);
      const name = relative(DASHBOARD, file);
      const id = guardIn(file);
      if (file.endsWith('layout.tsx')) {
        // The shell's own layout guards nothing; a route's layout guards its whole route.
        if (id && SCREENS[id as keyof typeof SCREENS]?.path !== route) problems.push(`${name}: guards '${id}'`);
        continue;
      }
      // A page inside a guarded layout of the same route (the profile's Details tab) is covered by it.
      const layout = files.find((f) => f.endsWith('layout.tsx') && routeOf(f) === route && guardIn(f));
      if (!id && layout) continue;
      if (!id) problems.push(`${name}: no requireScreen(…)`);
      else if (SCREENS[id as keyof typeof SCREENS]?.path !== route) problems.push(`${name}: guards '${id}', route ${route}`);
    }
    expect(problems).toEqual([]);
  });

  it('every SCREENS entry is a real page (no stale entries)', () => {
    const routes = new Set(files.map(routeOf));
    expect(SCREEN_IDS.filter((id) => !routes.has(SCREENS[id].path))).toEqual([]);
  });

  it('no page calls requirePermission with its own list (it would drift from SCREENS)', () => {
    expect(files.filter((f) => readFileSync(f, 'utf8').includes('requirePermission(')).map((f) => relative(DASHBOARD, f))).toEqual([]);
  });
});

describe('SCREENS — the sidebar and Settings', () => {
  it('the sidebar links to SIDEBAR_SCREENS, in that order', () => {
    expect(NAV_ITEMS.map((i) => i.key)).toEqual([...SIDEBAR_SCREENS]);
  });

  it('each sidebar item is its SCREENS entry: same path, same permissions', () => {
    for (const item of NAV_ITEMS) {
      const screen = SCREENS[item.key];
      expect(item.path).toBe(screen.path);
      expect(item.anyOf ?? null).toEqual(screen.anyOf);
    }
  });

  it('Settings opens for exactly the people who may view one of its sections', () => {
    expect(SCREENS.settings.anyOf).toEqual(Object.values(SETTINGS_SECTION_ACCESS));
    for (const role of BUILT_IN_ROLES) {
      const keys = Object.keys(role.permissions);
      expect(canOpenScreen(keys, 'settings'), role.key).toBe(visibleSettingsSections(keys).length > 0);
    }
  });
});
