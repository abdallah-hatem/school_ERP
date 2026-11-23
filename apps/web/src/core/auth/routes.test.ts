import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_SECTIONS, E2E_SECTIONS, isUnknownSection } from './routes';

const LOCALE_DIR = join(__dirname, '../../app/[locale]');

/**
 * Every route group under `app/[locale]`, with what it is. A new group fails here until it is
 * added — and each of its sections is either in APP_SECTIONS (sign-in first) or below.
 */
const GROUPS: Record<string, string> = {
  '(dashboard)': 'the signed-in shell',
  '(auth)': 'sign-in and the forced new password',
  '(e2e)': 'smoke-only pages (page.e2e.tsx), routes only in NEXT_PUBLIC_E2E_HOOKS builds',
};

/** Sections a signed-out visitor may reach without being sent to sign in, each with its reason. */
const PUBLIC_SECTIONS: Record<string, string> = {
  'e2e-root-error':
    '(e2e) smoke only: throws before reading anything, so the signed-out global-error check can reach it; not a route in other builds',
};

function dirs(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/** The first URL segments under a folder: route groups `(x)` are transparent, `_x` folders private. */
function segments(path: string): string[] {
  return dirs(path).flatMap((name) => {
    if (name.startsWith('_')) return [];
    if (name.startsWith('(')) return segments(join(path, name));
    return [name];
  });
}

/** Page files under a folder (any depth). */
function pages(path: string): string[] {
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && /^page\./.test(d.name))
    .map((d) => d.name);
}

const groups = dirs(LOCALE_DIR).filter((name) => name.startsWith('('));
const sections = groups.flatMap((group) => segments(join(LOCALE_DIR, group)).map((section) => ({ group, section })));

describe('APP_SECTIONS', () => {
  it('knows every route group under [locale]', () => {
    expect(groups.sort()).toEqual(Object.keys(GROUPS).sort());
  });

  it('nothing else under [locale] starts a URL except the catch-all 404', () => {
    expect(dirs(LOCALE_DIR).filter((name) => !name.startsWith('('))).toEqual(['[...missing]']);
  });

  it('every section of every group needs sign-in, or is public with a reason (fails closed)', () => {
    for (const { group, section } of sections) {
      const listed = APP_SECTIONS.has(section) || section in PUBLIC_SECTIONS || E2E_SECTIONS.includes(section);
      expect(listed, `${group}/${section}: add it to APP_SECTIONS (core/auth/routes.ts) or to PUBLIC_SECTIONS with a reason`).toBe(true);
    }
  });

  it('lists nothing that is not a section', () => {
    const names = new Set(sections.map((s) => s.section));
    for (const section of APP_SECTIONS) expect(names.has(section), section).toBe(true);
  });

  it('smoke-only sections hold only page.e2e.tsx files, and are known only in an e2e build', () => {
    for (const { group, section } of sections.filter((s) => E2E_SECTIONS.includes(s.section) || s.section in PUBLIC_SECTIONS)) {
      const found = pages(join(LOCALE_DIR, group, section));
      expect(found.length, `${group}/${section}`).toBeGreaterThan(0);
      expect(found.every((name) => name.endsWith('.e2e.tsx')), `${group}/${section}: ${found.join(', ')}`).toBe(true);
    }
    // This run has no NEXT_PUBLIC_E2E_HOOKS: the e2e section is an unknown address (a 404).
    for (const section of E2E_SECTIONS) expect(APP_SECTIONS.has(section)).toBe(false);
  });
});

describe('isUnknownSection', () => {
  it('the dashboard and every known section are known, at any depth', () => {
    for (const page of ['/', '/employees', '/employees/12/edit', '/login', '/set-password', '/accounting/payroll']) {
      expect(isUnknownSection(page), page).toBe(false);
    }
  });

  it('anything else is unknown', () => {
    for (const page of ['/nope', '/wp-admin', '/employee', '/Employees', '/x/employees', '/e2e/server-error']) {
      expect(isUnknownSection(page), page).toBe(true);
    }
  });
});
