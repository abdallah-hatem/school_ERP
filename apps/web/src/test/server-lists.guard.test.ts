import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Owner rule (2026-11-21, absolute): no paging, filtering, sorting or searching of lists in the
 * browser — the API does all four, and the totals over "all N" too. Two guards keep it:
 *
 * 1. At run time, `DataTable` throws (outside production) when handed more rows than its page
 *    size (`assertServerPage`): a whole list handed in to slice can't render in a test or in dev.
 * 2. This scan of `apps/web/src` (tests and fixtures left out) fails on the idioms of client-side
 *    lists: the text matcher, case-folded `includes`, a page slice, a page count from a length, a
 *    pagination `total` taken from an array's length, and any `.sort(` — each outside the explicit
 *    allow-list below, where every entry is static config from code or one record's own parts,
 *    never a list of database records.
 */

const SRC = join(__dirname, '..');

/** Files the scan may contain a pattern in, each with why (static config, not a list of records). */
const ALLOWED: Record<string, { pattern: string; why: string }[]> = {
  'modules/access/components/permission-groups.tsx': [
    { pattern: 'length-total', why: "A role form's count of a module's permission keys — the keys are code (`PERMISSIONS`), not records." },
  ],
  'shared/components/ui/combobox.tsx': [
    {
      pattern: 'matcher',
      why: "A combobox WITHOUT `server` filters its own short options: code lists (enums such as a status, a work system, a penalty action). Every picker over records passes `server` and the API searches.",
    },
  ],
  'core/audit/components/record-history.tsx': [
    {
      pattern: 'sort',
      why: "The History tab's field filter: the record's changed field KEYS (code identifiers, bounded by the schema), ordered by their translated label — the API can't order by a label it doesn't have.",
    },
  ],
  'core/audit/lib/entry-text.ts': [
    { pattern: 'sort', why: "One audit entry's own changed fields, in a fixed display order (status first)." },
  ],
  'core/notifications/components/type-switch-list.tsx': [
    { pattern: 'sort', why: 'The notification types are a constant in code (`NOTIFICATION_TYPES`), grouped approvals first.' },
  ],
  'modules/settings/components/violation-dialog.tsx': [
    { pattern: 'sort', why: "One violation's own levels (1, 2, 3…), in order, in its edit form." },
  ],
  'modules/settings/components/catalogue-section.tsx': [
    { pattern: 'sort', why: "One violation's own levels (1, 2, 3…), in order, in its row." },
  ],
  'modules/settings/components/hr-rules-section.tsx': [
    { pattern: 'sort', why: "The lateness rule's own steps (hour 1, 2…), a setting value, in its form." },
  ],
  'modules/hr/lateness/describe-rule.ts': [{ pattern: 'sort', why: "The lateness rule's own steps, put in words." }],
  'modules/hr/employees/lib/stage-band.ts': [
    {
      pattern: 'sort',
      why: "A colour per stage by its place in the school's order (the cards' bands): a colour map from the API's stage order, not a list on screen.",
    },
  ],
};

const PATTERNS: { name: string; re: RegExp; what: string }[] = [
  { name: 'matcher', re: /\b(matchesSearch|searchKey)\s*\(/, what: 'the text matcher (the API searches lists)' },
  { name: 'includes', re: /\.to(Locale)?LowerCase\(\)\s*\.includes\(/, what: 'a case-folded includes (a client-side search)' },
  { name: 'page-slice', re: /\.slice\(\s*\(\s*\w+\s*-\s*1\s*\)\s*\*/, what: 'a page slice (the API pages)' },
  { name: 'page-count', re: /Math\.ceil\([^)]*\.length\s*\/\s*\w+/, what: 'a page count from a length (the API counts)' },
  { name: 'length-total', re: /\btotal:\s*[\w.?!]+\.length\b(?!\s*[-+*/])/, what: "a pagination total from an array's length (the API counts)" },
  { name: 'sort', re: /\.sort\(/, what: 'a sort (the API orders lists)' },
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'test' || name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe('no client-side lists (owner, 2026-11-21)', () => {
  const files = sourceFiles(SRC).map((path) => ({ path, rel: relative(SRC, path), text: readFileSync(path, 'utf8') }));

  it('scans the app (sanity: it sees the screens)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.rel === 'modules/accounting/components/statement.tsx')).toBe(true);
  });

  it('no list is paged, searched, sorted or counted in the browser outside the allow-list', () => {
    const found: string[] = [];
    for (const f of files) {
      f.text.split('\n').forEach((line, i) => {
        // Comments may name the idioms.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const p of PATTERNS) {
          if (!p.re.test(line)) continue;
          if (ALLOWED[f.rel]?.some((a) => a.pattern === p.name)) continue;
          found.push(`${f.rel}:${i + 1} — ${p.what}: ${line.trim()}`);
        }
      });
    }
    expect(found, `Client-side list handling found. Move it to the API (page, limit, search, filters, sort, totals) or, for static config only, add it to ALLOWED with the reason:\n${found.join('\n')}`).toEqual([]);
  });

  it('every allow-list entry is still needed (no stale exceptions)', () => {
    const stale: string[] = [];
    for (const [rel, entries] of Object.entries(ALLOWED)) {
      const file = files.find((f) => f.rel === rel);
      for (const entry of entries) {
        const re = PATTERNS.find((p) => p.name === entry.pattern)!.re;
        if (!file || !file.text.split('\n').some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && re.test(l))) stale.push(`${rel} (${entry.pattern})`);
      }
    }
    expect(stale).toEqual([]);
  });
});
