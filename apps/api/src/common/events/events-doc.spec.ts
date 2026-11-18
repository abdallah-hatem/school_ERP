import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as shared from '@school-erp/shared';

/*
 * docs/EVENTS.md stays true to the code (owner, 2026-11-18). A source scan, like the audit and
 * permission scans: every event constant in packages/shared, every publish site and every listener
 * (`@OnDomainEvent`, `@OutboxListener`) in apps/api/src, and every file that opens or joins a
 * transaction must be in the doc — and everything the doc names must still exist. Each event's
 * kind (must-deliver or fire-and-forget) must match `MUST_DELIVER_EVENTS`.
 */

const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SRC = join(ROOT, 'apps', 'api', 'src');
const DOC_PATH = 'docs/EVENTS.md';
const FIX = `Update ${DOC_PATH} (see its "How to update this file").`;
/** core/events defines DomainEvents and the decorators: not a publisher or a listener itself. */
const MECHANISM = 'apps/api/src/core/events/';

const rel = (path: string): string => relative(ROOT, path).split('\\').join('/');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** `HrEvent.PAYROLL_APPROVED` → `'hr.payroll.approved'`, for every `*Event` constant group. */
function eventConstants(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [group, value] of Object.entries(shared)) {
    if (!/Event$/.test(group) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.every(([, v]) => typeof v === 'string')) continue;
    for (const [key, name] of entries) out.set(`${group}.${key}`, name as string);
  }
  return out;
}

const EVENT_REF = /\b([A-Z]\w*Event)\.([A-Z][A-Z0-9_]*)\b/g;
const TRANSACTION_SITE =
  /withTransaction\(|\.inTransaction\(|afterCommit\.transaction\(|afterCommit\.run\(|afterCommit\.onRollback\(|Propagation\.RequiresNew|\$transaction\(/;
const LISTENER = /@(OnDomainEvent|OutboxListener)\(\s*(?:\{\s*event:\s*)?([A-Z]\w*Event\.[A-Z0-9_]+)/g;

interface Listener {
  event: string;
  kind: 'OnDomainEvent' | 'OutboxListener';
  className: string;
  file: string;
}

const events = eventConstants();
const mustDeliver = new Set<string>(shared.MUST_DELIVER_EVENTS);
const files = sourceFiles(SRC).map((path) => ({ path: rel(path), text: readFileSync(path, 'utf8') }));
const doc = readFileSync(join(ROOT, DOC_PATH), 'utf8');

/** The doc's text between `## <title>` and the next `## `. */
function docSection(title: string): string {
  const start = doc.indexOf(`\n## ${title}`);
  if (start < 0) throw new Error(`${DOC_PATH} has no "## ${title}" section. ${FIX}`);
  const end = doc.indexOf('\n## ', start + 1);
  return doc.slice(start, end < 0 ? undefined : end);
}

/** Each `### \`Group.KEY\` — \`'name'\`` section of the catalogue: its constant, name and text. */
function catalogue(): { ref: string; name: string; text: string }[] {
  return docSection('Events catalogue')
    .split(/^### /m)
    .slice(1)
    .map((text) => {
      const heading = /^`(\w+\.[A-Z0-9_]+)`\s*—\s*`'([^']+)'`/.exec(text);
      if (!heading) throw new Error(`Bad event heading in ${DOC_PATH}: "### ${text.split('\n')[0]}". ${FIX}`);
      return { ref: heading[1], name: heading[2], text };
    });
}

/** The files that publish (inject `DomainEvents`), with the event refs each uses. */
const publishers = files.filter((f) => !f.path.startsWith(MECHANISM) && /:\s*DomainEvents\b/.test(f.text));

function publishSites(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { path, text } of publishers) {
    const refs = [...text.matchAll(EVENT_REF)].map((m) => `${m[1]}.${m[2]}`).filter((r) => events.has(r));
    for (const ref of new Set(refs)) out.set(ref, [...(out.get(ref) ?? []), path]);
  }
  return out;
}

function listeners(): Listener[] {
  return files
    .filter((f) => !f.path.startsWith(MECHANISM))
    .flatMap(({ path, text }) =>
      [...text.matchAll(LISTENER)].map((m) => {
        // A class decorator: the class it marks comes after it.
        const after = /class\s+(\w+)/.exec(text.slice(m.index));
        return {
          kind: m[1] as Listener['kind'],
          event: m[2],
          className: after?.[1] ?? '?',
          file: path,
        };
      }),
    );
}

describe(`${DOC_PATH} matches the code`, () => {
  const sections = catalogue();
  const byRef = new Map(sections.map((s) => [s.ref, s]));
  const sites = publishSites();
  const listenerList = listeners();

  it('finds the events, publish sites and listeners', () => {
    expect(events.size).toBeGreaterThan(3);
    expect(sites.size).toBeGreaterThan(3);
    expect(listenerList.length).toBeGreaterThan(1);
  });

  it('publishes and listens by the shared constants, never by a string', () => {
    const literal = files
      .filter((f) => /\.publish\(\s*['"`]|@OnDomainEvent\(\s*['"`]|@OutboxListener\(\s*\{\s*event:\s*['"`]/.test(f.text))
      .map((f) => f.path);
    expect(literal).toEqual([]);
    const unknown = listenerList.filter((l) => !events.has(l.event)).map((l) => `${l.file}: ${l.event}`);
    expect(unknown).toEqual([]);
    const silent = publishers
      .filter((f) => ![...f.text.matchAll(EVENT_REF)].some((m) => events.has(`${m[1]}.${m[2]}`)))
      .map((f) => f.path);
    expect(silent).toEqual([]);
  });

  it('every event constant has its catalogue section, with the right name and kind', () => {
    const missing = [...events].filter(([ref]) => !byRef.has(ref)).map(([ref, name]) => `${ref} ('${name}')`);
    expect({ missing, fix: FIX }).toEqual({ missing: [], fix: FIX });
    const wrong = sections
      .filter((s) => events.has(s.ref) && events.get(s.ref) !== s.name)
      .map((s) => `${s.ref}: doc says '${s.name}', code says '${events.get(s.ref)}'`);
    expect({ wrong, fix: FIX }).toEqual({ wrong: [], fix: FIX });
    const kinds = sections
      .filter((s) => events.has(s.ref))
      .flatMap((s) => {
        const row = s.text.split('\n').find((line) => line.startsWith('| Kind |')) ?? '';
        const expected = mustDeliver.has(events.get(s.ref)!) ? 'must-deliver' : 'fire-and-forget';
        return row.includes(`**${expected}**`) ? [] : [`${s.ref}: its "| Kind |" row must say **${expected}**`];
      });
    expect({ kinds, fix: FIX }).toEqual({ kinds: [], fix: FIX });
  });

  it('the catalogue names no event that no longer exists', () => {
    const gone = sections.filter((s) => !events.has(s.ref)).map((s) => s.ref);
    expect({ gone, fix: FIX }).toEqual({ gone: [], fix: FIX });
  });

  it("every publish site is in its event's section, and every publisher named there still publishes it", () => {
    const missing = [...sites].flatMap(([ref, paths]) =>
      paths.filter((p) => !byRef.get(ref)?.text.includes(p)).map((p) => `${ref} published by ${p}`),
    );
    expect({ missing, fix: FIX }).toEqual({ missing: [], fix: FIX });
    const stale = sections.flatMap((s) => {
      const row = s.text.split('\n').find((line) => line.startsWith('| Published by |')) ?? '';
      return [...row.matchAll(/`(apps\/[\w./-]+\.ts)`/g)]
        .map((m) => m[1])
        .filter((p) => !(sites.get(s.ref) ?? []).includes(p))
        .map((p) => `${s.ref}: ${p} no longer publishes it`);
    });
    expect({ stale, fix: FIX }).toEqual({ stale: [], fix: FIX });
  });

  it("every listener is in its event's section, and every listener named there still listens", () => {
    const missing = listenerList
      .filter((l) => {
        const text = byRef.get(l.event)?.text ?? '';
        return !text.includes(l.className) || !text.includes(l.file);
      })
      .map((l) => `${l.event} → ${l.className} (${l.file})`);
    expect({ missing, fix: FIX }).toEqual({ missing: [], fix: FIX });
    const stale = sections.flatMap((s) =>
      [...new Set([...s.text.matchAll(/`(\w+Listener)\b/g)].map((m) => m[1]))]
        .filter((name) => !listenerList.some((l) => l.event === s.ref && l.className === name))
        .map((name) => `${s.ref}: ${name} no longer listens to it`),
    );
    expect({ stale, fix: FIX }).toEqual({ stale: [], fix: FIX });
  });

  it('every file that opens or joins a transaction is in the Transactions map', () => {
    const map = docSection('Transactions map');
    const missing = files.filter((f) => TRANSACTION_SITE.test(f.text) && !map.includes(f.path)).map((f) => f.path);
    expect({ missing, fix: FIX }).toEqual({ missing: [], fix: FIX });
  });

  it('every file the doc names exists', () => {
    const paths = [...doc.matchAll(/`((?:apps|packages)\/[\w./-]+\.tsx?)`/g)].map((m) => m[1]);
    const gone = [...new Set(paths)].filter((p) => !existsSync(join(ROOT, p)));
    expect({ gone, fix: FIX }).toEqual({ gone: [], fix: FIX });
  });
});
