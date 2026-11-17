import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Language } from '@school-erp/shared';

/*
 * The app's own locale files, so specs find elements by the same accessible names a person sees —
 * and keep working when a label's wording changes. `t('en', 'penalties.record')` reads
 * `penalties.json` → `record`; `{name}` placeholders are filled from `values`.
 */

const LOCALES_DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'shared', 'locales');

type Tree = { [key: string]: string | Tree };
const cache = new Map<string, Tree>();

function namespace(locale: Language, ns: string): Tree {
  const key = `${locale}/${ns}`;
  let tree = cache.get(key);
  if (!tree) {
    tree = JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${ns}.json`), 'utf8')) as Tree;
    cache.set(key, tree);
  }
  return tree;
}

export function t(locale: Language, key: string, values: Record<string, string | number> = {}): string {
  const [ns = '', ...path] = key.split('.');
  let node: string | Tree | undefined = namespace(locale, ns);
  for (const part of path) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') throw new Error(`smoke: missing locale key ${locale}:${key}`);
  return node.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** A RegExp matching `text` literally (for accessible names that contain it). */
export function literal(text: string, flags = ''): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
}

/**
 * The part of a translated template before its first unfilled placeholder:
 * `"Level {level} — {action}"` with `{ level: 2 }` gives `"Level 2 — "`.
 */
export function prefixOf(locale: Language, key: string, values: Record<string, string | number>): string {
  const filled = t(locale, key, values);
  const cut = filled.indexOf('{');
  return cut === -1 ? filled : filled.slice(0, cut);
}
