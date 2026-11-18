import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * The pool rule (docs/EVENTS.md → Transactions map, the #109 lesson): nothing may hold one pooled
 * connection while it waits for another. An `@Audited` handler holds the request transaction's
 * connection for the whole request, so under it a `Propagation.RequiresNew` or a write on the plain
 * client (`DatabaseService`, outside `txHost.tx`) needs a second one at the same time — with as many
 * concurrent requests as the pool has connections, every request starves.
 *
 * A source scan: every RequiresNew and every plain-client write in apps/api/src must be listed
 * below with why it never runs while a request transaction is held (or why holding two is bounded).
 * A new one fails this test until it is justified here — and reviewed. An entry that no longer
 * matches anything fails too, so the list stays true.
 */

const SRC = join(__dirname, '..');

type Kind = 'RequiresNew' | 'plain-client write';

const ALLOWED: Record<string, Partial<Record<Kind, string>>> = {
  'core/auth/services/auth.service.ts': {
    RequiresNew:
      'the failed sign-in entry: POST /auth/login is @NotAudited and opens no request transaction ' +
      '(the audit-declarations scan pins it), so this is the only connection held',
  },
  'core/sign-in-limit/sign-in-limit.service.ts': {
    RequiresNew:
      'the lockout entry, from sign-in and POST /account/password — both @NotAudited, no request ' +
      'transaction held (gap 10, the audit-declarations scan pins both)',
  },
  'core/sign-in-limit/repositories/login-attempts.repository.ts': {
    'plain-client write':
      'the atomic wrong-password upsert, which must outlive a failing request; its callers (sign-in, ' +
      'POST /account/password) hold no request transaction',
  },
  'core/auth/repositories/refresh-tokens.repository.ts': {
    'plain-client write':
      'token rotation on POST /auth/refresh: @NotAudited (deliberately, gap 9), no request transaction',
  },
  'core/jobs/repositories/job-runs.repository.ts': {
    'plain-client write':
      'jobs run outside any request. A locked job holds its lock transaction while its own work ' +
      'takes a second connection — one per running job, bounded; a job that delivers many writes ' +
      'runs with lock: false (outbox.deliver)',
  },
  'common/repositories/base.repository.ts': {
    'plain-client write':
      'the generic create / update / delete; a repository whose writes run under a request ' +
      'transaction writes through txHost.tx instead (no service calls these for an audited write)',
  },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const WRITE = String.raw`(?:\$transaction|\$executeRaw\w*|\$queryRaw\w*|(?:\w+\.)?(?:create|createMany|update|updateMany|upsert|delete|deleteMany))\b`;

/** The connection-sensitive sites of one file. */
function sitesOf(text: string): Kind[] {
  const kinds = new Set<Kind>();
  if (/Propagation\.RequiresNew/.test(text)) kinds.add('RequiresNew');
  // The names a plain client goes by in this file: constructor parameters typed DatabaseService,
  // and BaseRepository's `model` getter over it.
  const names = [...text.matchAll(/(\w+)\s*:\s*DatabaseService\b/g)].map((m) => m[1]);
  if (/get model\(\)/.test(text)) names.push('model');
  for (const name of new Set(names)) {
    if (new RegExp(String.raw`this\.${name}\.${WRITE}`).test(text)) kinds.add('plain-client write');
  }
  return [...kinds];
}

describe('no second pooled connection under a request transaction (gap 11)', () => {
  const found = sourceFiles(SRC)
    .filter((path) => !path.includes(`${join('src', 'database')}`))
    .flatMap((path) => {
      const file = relative(SRC, path).split('\\').join('/');
      return sitesOf(readFileSync(path, 'utf8')).map((kind) => ({ file, kind }));
    });

  it('the scan recognises both kinds', () => {
    expect(sitesOf('txHost.withTransaction(Propagation.RequiresNew, fn)')).toEqual(['RequiresNew']);
    expect(
      sitesOf('constructor(private readonly plain: DatabaseService) {} x() { this.plain.user.update({}) }'),
    ).toEqual(['plain-client write']);
    expect(sitesOf('constructor(private readonly db: DatabaseService) {} x() { this.db.user.findMany() }')).toEqual(
      [],
    );
    // Through txHost.tx it joins the caller's transaction: not a second connection.
    expect(sitesOf('get db() { return this.txHost.tx } x() { this.db.user.update({}) }')).toEqual([]);
  });

  it('every RequiresNew and plain-client write is on the list, with its reason', () => {
    const unlisted = found
      .filter(({ file, kind }) => !ALLOWED[file]?.[kind])
      .map(({ file, kind }) => `${file}: ${kind}`);
    expect(unlisted).toEqual([]);
  });

  it('every entry on the list still matches the code', () => {
    const stale = Object.entries(ALLOWED).flatMap(([file, kinds]) =>
      (Object.keys(kinds) as Kind[])
        .filter((kind) => !found.some((f) => f.file === file && f.kind === kind))
        .map((kind) => `${file}: ${kind}`),
    );
    expect(stale).toEqual([]);
  });
});
