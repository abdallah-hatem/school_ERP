import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_KEYS,
  AUDIT_ACTION_KINDS,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_MODULES,
  HrCatalogueKey,
  HrListKey,
  HrSettingKey,
  SchoolSettingKey,
  SETTINGS_HISTORY_ACTION_KEYS,
  isAuditAction,
} from '../src';

type Tree = { [k: string]: string | Tree };

const load = (lang: string): Tree =>
  JSON.parse(readFileSync(join(__dirname, '..', 'locales', lang, 'audit.json'), 'utf8')) as Tree;

/** A dot path in a message tree, the way both apps look messages up (`actions.hr.employee.create`). */
function at(tree: Tree, path: string): string | Tree | undefined {
  return path
    .split('.')
    .reduce<string | Tree | undefined>(
      (node, part) => (node && typeof node === 'object' ? node[part] : undefined),
      tree,
    );
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('audit action registry (D5)', () => {
  const en = load('en');
  const ar = load('ar');

  it('every action belongs to a known module, entity type and kind', () => {
    for (const key of AUDIT_ACTION_KEYS) {
      const def = AUDIT_ACTIONS[key];
      expect(AUDIT_MODULES).toContain(def.module);
      expect(AUDIT_ENTITY_TYPES).toContain(def.entityType);
      expect(AUDIT_ACTION_KINDS).toContain(def.kind);
      // The key starts with its module: `hr.employee.create` is an HR action.
      expect(key.startsWith(`${def.module}.`)).toBe(true);
    }
  });

  it.each(AUDIT_ACTION_KEYS)(
    '%s has an English and an Arabic sentence with the same placeholders',
    (key) => {
      const sentenceEn = at(en, `actions.${key}`);
      const sentenceAr = at(ar, `actions.${key}`);
      expect(typeof sentenceEn).toBe('string');
      expect(typeof sentenceAr).toBe('string');
      expect(placeholders(sentenceAr as string)).toEqual(placeholders(sentenceEn as string));
      // Edge case 10 — the Arabic sentence is Arabic, not a copy of the English one.
      expect(sentenceAr).toMatch(/[\u0600-\u06FF]/);
    },
  );

  it('the locale files hold no sentence for an action that is not in the registry', () => {
    const leaves = (tree: Tree, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([k, v]) =>
        typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`),
      );
    expect(leaves(at(en, 'actions') as Tree).sort()).toEqual([...AUDIT_ACTION_KEYS].sort());
  });

  it('every module, entity type and kind has a label in both languages', () => {
    for (const tree of [en, ar]) {
      for (const m of AUDIT_MODULES) expect(typeof at(tree, `modules.${m}`)).toBe('string');
      for (const t of AUDIT_ENTITY_TYPES) expect(typeof at(tree, `entities.${t}`)).toBe('string');
      for (const k of AUDIT_ACTION_KINDS) expect(typeof at(tree, `kinds.${k}`)).toBe('string');
    }
  });

  it('every setting key and history key has a field label (settings history, D9)', () => {
    const fields = [
      ...Object.values(SchoolSettingKey),
      ...Object.values(HrSettingKey),
      ...Object.values(HrListKey),
      ...Object.values(HrCatalogueKey),
      'lists.stages',
    ];
    for (const tree of [en, ar]) {
      for (const f of fields) expect(typeof at(tree, `fields.${f}`)).toBe('string');
    }
  });

  it('settings-history actions are registry actions; isAuditAction rejects unknown keys', () => {
    for (const key of SETTINGS_HISTORY_ACTION_KEYS) expect(isAuditAction(key)).toBe(true);
    expect(isAuditAction('hr.employee.delete')).toBe(false);
    expect(isAuditAction('toString')).toBe(false);
    expect(isAuditAction(42)).toBe(false);
  });
});
