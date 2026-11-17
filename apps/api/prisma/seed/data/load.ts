import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { violationLevelsProblem } from '@school-erp/shared';
import { FALLBACK_CATALOGUE, FALLBACK_SCHOOL } from './fallback';
import {
  DEMO_VIOLATION_KEYS,
  type SeedCatalogue,
  type SeedData,
  type SeedLevel,
  type SeedSchool,
} from './types';

/**
 * The git-ignored folder of client material (`**\/seed-data.local/` in .gitignore):
 *
 *   school.json     { "nameEn": "...", "nameAr": "..." }
 *   catalogue.json  { "groups": [{ nameEn, nameAr, violations: [{ nameEn, nameAr, note?, seedKey?,
 *                     levels: [{ action, days? }] }] }] }
 *   logo.png        (or logo.jpg / logo.svg) — optional
 *
 * `SEED_DATA_DIR` points somewhere else (absolute or relative to the working directory).
 */
export function localDataDir(): string {
  const override = process.env.SEED_DATA_DIR;
  return override ? resolve(override) : resolve(__dirname, '..', '..', 'seed-data.local');
}

const LOGO_FILES = ['logo.png', 'logo.jpg', 'logo.svg'];

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    throw new Error(`seed: cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Throws on anything the catalogue service would refuse, and on missing demo keys. */
export function assertCatalogue(catalogue: SeedCatalogue, source: string): void {
  if (!Array.isArray(catalogue.groups) || catalogue.groups.length === 0) {
    throw new Error(`seed: ${source} catalogue has no groups`);
  }
  const keys = new Set<string>();
  for (const group of catalogue.groups) {
    if (!group.nameEn || !group.nameAr) throw new Error(`seed: ${source} group without a name`);
    for (const v of group.violations) {
      if (!v.nameEn || !v.nameAr) throw new Error(`seed: ${source} violation without a name`);
      const problem = violationLevelsProblem(levelsOf(v.levels));
      if (problem) throw new Error(`seed: ${source} "${v.nameEn}" has invalid levels (${problem})`);
      if (v.seedKey) {
        if (keys.has(v.seedKey)) throw new Error(`seed: ${source} repeats seedKey ${v.seedKey}`);
        keys.add(v.seedKey);
      }
    }
  }
  const missing = DEMO_VIOLATION_KEYS.filter((k) => !keys.has(k));
  if (missing.length) throw new Error(`seed: ${source} catalogue lacks ${missing.join(', ')}`);
}

/** Positional levels → the numbered levels the catalogue stores. */
export function levelsOf(levels: readonly SeedLevel[]) {
  return levels.map((l, i) => ({ level: i + 1, action: l.action, days: l.days ?? null }));
}

/** Local client material when the folder has it, else the generic fallback. */
export function loadSeedData(dir = localDataDir()): SeedData {
  const schoolPath = join(dir, 'school.json');
  const cataloguePath = join(dir, 'catalogue.json');
  if (!existsSync(schoolPath) || !existsSync(cataloguePath)) {
    assertCatalogue(FALLBACK_CATALOGUE, 'fallback');
    return {
      source: 'fallback',
      school: FALLBACK_SCHOOL,
      catalogue: FALLBACK_CATALOGUE,
      logoPath: null,
    };
  }
  const school = readJson<SeedSchool>(schoolPath);
  if (!school.nameEn || !school.nameAr)
    throw new Error('seed: school.json needs nameEn and nameAr');
  const catalogue = readJson<SeedCatalogue>(cataloguePath);
  assertCatalogue(catalogue, 'local');
  const logo = LOGO_FILES.map((f) => join(dir, f)).find((p) => existsSync(p)) ?? null;
  return { source: 'local', school, catalogue, logoPath: logo };
}
