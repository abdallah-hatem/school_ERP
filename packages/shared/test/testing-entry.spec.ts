import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as main from '../src';

/*
 * Test data stays out of app bundles: fixtures live in `src/testing` (`@school-erp/shared/testing`),
 * the main entry never re-exports them, and no app source imports them.
 */
const repo = resolve(__dirname, '../../..');
const APP_SOURCES = ['apps/api/src', 'apps/web/src', 'packages/shared/src'];
const TEST_FILE = /(\.spec|\.test)\.tsx?$|\/(test|tests|__tests__|e2e)\//;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('the testing entry', () => {
  it('the main entry exports no fixture', () => {
    expect(Object.keys(main).filter((k) => /FIXTURE/.test(k))).toEqual([]);
  });

  it('no app source imports the testing entry', () => {
    const offenders = APP_SOURCES.flatMap((d) => sources(join(repo, d)))
      .filter((p) => !TEST_FILE.test(p) && !p.includes('/shared/src/testing/'))
      .filter((p) => /from ['"](@school-erp\/shared\/testing|[^'"]*\/testing)['"]/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(repo.length + 1));
    expect(offenders).toEqual([]);
  });
});
