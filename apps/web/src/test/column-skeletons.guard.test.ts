import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanColumns } from './column-cells';

/*
 * Guard: a table column whose cell is anything but one line of text declares its `skeleton`.
 *
 * What happened (owner, 2026-11-25): the employee profile's Payroll tab drew its Status column as a
 * pill (`RunStatusPill`) but gave the column no `skeleton`, so DataTable drew its default — one thin
 * `<SkeletonText />` line. Each loading row came out a few px shorter than the loaded row and the
 * table jumped when the data arrived; the smoke skeleton spec's ±8px let it through. The owner:
 * "make sure this issue never happens again". The smoke spec now holds table rows and cards to ±2px
 * (`e2e/support/skeleton-diff.ts`); this scan catches the cause before a browser is involved.
 *
 * The rule, default-deny: every column declares `skeleton:` UNLESS its cell is provably one plain
 * line of text — text, numbers, `t(…)` and the `format*` helpers, inside the few inline renderers
 * listed in `ONE_LINE_TAGS` (`span`, `bdi`, `Link`, `Money`, `Days`…), with no class that makes it
 * taller (`flex-col`, padding, `h-`/`size-`, `rounded-full`, a border, larger text). Anything else —
 * a pill, badge or chip, an avatar or avatar stack, a button, an identity (avatar + name + code), a
 * stacked two-line cell, an icon beside text, Money with a sub-line, a page's own component, a cell
 * with a function body — needs its `skeleton`.
 *
 * Why this and not a list of "tall" components detected by name: a name list only knows the
 * components someone remembered to add, and misses a hand-rolled stack (`<span className="flex
 * flex-col">`), an icon beside a link, or a new pill named `…Tag`. The allowlist fails closed: a
 * new kind of cell is flagged until it either declares its skeleton or is shown to be one line and
 * added to `ONE_LINE_TAGS` with its reason. Columns built through the file's own builders
 * (`col('net', (line) => …)`, `...runColumn('net', t)`, `...LAYOUT[id]`) are evaluated with their
 * arguments, so a skeleton in shared parts counts and a cell passed in is the one checked.
 */

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : [];
  });
}

const tables = sources(SRC)
  .map((path) => ({ path, rel: relative(SRC, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }))
  .filter((f) => /\bDataTable(Column)?\b/.test(f.text));

describe('column skeletons', () => {
  const scans = tables.map((f) => ({ ...f, ...scanColumns(f.rel, f.text) }));

  it('finds the tables', () => {
    expect(scans.length).toBeGreaterThan(10);
    expect(scans.reduce((n, s) => n + s.columns, 0)).toBeGreaterThan(50);
    expect(scans.find((s) => s.rel === 'modules/hr/payroll/components/employee-payroll.tsx')?.columns).toBeGreaterThan(0);
  });

  it('gives every column whose cell is more than one line of text a skeleton', () => {
    const missing = scans.flatMap((s) =>
      s.missing.map(
        (c) =>
          `${s.rel}:${c.line} column "${c.id}": ${c.reason}. Add \`skeleton:\` drawing the loaded cell's shape and height ` +
          '(SkeletonPill, SkeletonIdentity, SkeletonAvatarStack, SkeletonButton, RowActionsSkeleton, a stack of sized SkeletonText — shared/components/ui/skeleton.tsx).',
      ),
    );
    expect(missing, missing.join('\n')).toEqual([]);
  });
});

describe('the column scan', () => {
  const missing = (body: string) => scanColumns('x.tsx', `const columns: DataTableColumn<R>[] = [${body}];`).missing.map((m) => m.id);

  it('flags the Payroll tab as it was: a pill with no skeleton', () => {
    expect(missing(`{ id: 'status', header: 'Status', cell: ({ status }) => <RunStatusPill status={status} /> }`)).toEqual(['status']);
  });

  it('flags avatars, buttons, stacked cells, icons beside text and function bodies', () => {
    expect(missing(`{ id: 'a', header: 'A', cell: (r) => <span className="flex items-center gap-2"><AvatarStack people={r.p} />{r.n}</span> }`)).toEqual(['a']);
    expect(missing(`{ id: 'b', header: 'B', cell: (r) => <Button>{r.n}</Button> }`)).toEqual(['b']);
    expect(missing(`{ id: 'c', header: 'C', cell: (r) => <span className="flex flex-col">{r.a}<span className="text-xs">{r.b}</span></span> }`)).toEqual(['c']);
    expect(missing(`{ id: 'd', header: 'D', cell: (r) => <span><LockIcon className="size-4" />{r.n}</span> }`)).toEqual(['d']);
    expect(missing(`{ id: 'e', header: 'E', cell: (r) => { return r.n; } }`)).toEqual(['e']);
    expect(missing(`{ id: 'f', header: 'F', cell: (r) => <span className={cn('x', r.y)}>{r.n}</span> }`)).toEqual(['f']);
  });

  it('passes one line of text, and any column that declares its skeleton', () => {
    expect(missing(`{ id: 'a', header: 'A', cell: (r) => <span className="tabular font-bold">{formatCount(r.n)}</span> }`)).toEqual([]);
    expect(missing(`{ id: 'b', header: 'B', cell: (r) => (r.at ? <bdi className="tabular">{formatDate(r.at)}</bdi> : t('x')) }`)).toEqual([]);
    expect(missing(`{ id: 'c', header: 'C', cell: (r) => <Money value={r.net} currency={false} className="font-bold" /> }`)).toEqual([]);
    expect(missing(`{ id: 'd', header: 'D', skeleton: <SkeletonPill />, cell: (r) => <StatusPill>{r.s}</StatusPill> }`)).toEqual([]);
  });

  it("follows the file's own builders and shared parts", () => {
    const src = `
      const LAYOUT = { status: { skeleton: <SkeletonPill /> }, net: { align: 'end' } };
      const part = (id) => ({ id, header: id, ...LAYOUT[id] });
      const col = (id, cell, extra = {}) => ({ id, header: id, cell, ...extra });
      const money = (v) => <Money value={v} currency={false} />;
      const columns = [
        { ...part('status'), cell: (r) => <StatusPill>{r.s}</StatusPill> },
        { ...part('net'), cell: (r) => <Pill>{r.n}</Pill> },
        col('plain', (r) => money(r.v)),
        col('tall', (r) => <Badge>{r.v}</Badge>),
        col('tallWithSkeleton', (r) => <Badge>{r.v}</Badge>, { skeleton: <SkeletonPill /> }),
      ];`;
    expect(scanColumns('x.tsx', src).missing.map((m) => m.id)).toEqual(['net', 'tall']);
  });

  it('asks an exported column builder to carry its own skeleton', () => {
    const src = `export function actionsColumn(header, cell) { return { id: 'actions', header, cell }; }`;
    expect(scanColumns('x.tsx', src).missing.map((m) => m.id)).toEqual(['actions']);
  });
});
