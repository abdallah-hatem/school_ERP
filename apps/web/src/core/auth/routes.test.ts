import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_SECTIONS, isUnknownSection } from './routes';

const LOCALE_DIR = join(__dirname, '../../app/[locale]');

/** Folders that start a URL segment (route groups `(x)` and private `_x` folders don't). */
function sections(group: string): string[] {
  return readdirSync(join(LOCALE_DIR, group), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('(') && !d.name.startsWith('_'))
    .map((d) => d.name);
}

describe('APP_SECTIONS', () => {
  it('lists exactly the first segments of the dashboard and sign-in pages', () => {
    expect([...APP_SECTIONS].sort()).toEqual([...sections('(dashboard)'), ...sections('(auth)')].sort());
  });

  it('nothing else under [locale] starts a URL except the catch-all 404', () => {
    const others = readdirSync(LOCALE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('('))
      .map((d) => d.name);
    expect(others).toEqual(['[...missing]']);
  });
});

describe('isUnknownSection', () => {
  it('the dashboard and every known section are known, at any depth', () => {
    for (const page of ['/', '/employees', '/employees/12/edit', '/login', '/set-password', '/accounting/payroll']) {
      expect(isUnknownSection(page), page).toBe(false);
    }
  });

  it('anything else is unknown', () => {
    for (const page of ['/nope', '/wp-admin', '/employee', '/Employees', '/x/employees']) {
      expect(isUnknownSection(page), page).toBe(true);
    }
  });
});
