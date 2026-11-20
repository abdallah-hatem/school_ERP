import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_ROLES } from '@school-erp/shared';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The migration that grants `core.outbox.manage` (admin retry of a dead outbox delivery): an
 * existing database — the demo DB, every school's — gets its roles' permissions from migrations, so
 * without it the System admin could never see or retry a dead delivery. Replays the real migration
 * files in a throwaway schema: everything before it (a database as it was before the outbox), then
 * the migration, then the migration again.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const MIGRATION = '20261118230100_outbox_manage_grant';
const KEY = 'core.outbox.manage';
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const before = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n) && n < MIGRATION)
  .sort();

function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('core.outbox.manage granted on existing databases (migration, e2e)', () => {
  const schema = `outbox_grant_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  const holders = async () =>
    (
      await db.role.findMany({
        where: { permissions: { some: { permissionKey: KEY } } },
        select: { key: true, permissions: { where: { permissionKey: KEY }, select: { scope: true } } },
        orderBy: { key: 'asc' },
      })
    ).map((r) => ({ key: r.key, scopes: r.permissions.map((p) => p.scope) }));

  beforeAll(async () => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    db = clientForSchema(schema);
    // Before the migration: nobody holds it (the bug a database without it would have).
    expect(await holders()).toEqual([]);
    runSql(schema, migrationSql(MIGRATION));
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('the System admin holds it (scope all), as BUILT_IN_ROLES says — and only the roles that list it', async () => {
    const expected = BUILT_IN_ROLES.filter((r) => r.permissions[KEY])
      .map((r) => ({ key: r.key, scopes: [r.permissions[KEY]] }))
      .sort((a, b) => a.key.localeCompare(b.key));
    expect(expected).toEqual([{ key: 'system_admin', scopes: ['all'] }]);
    expect(await holders()).toEqual(expected);
  });

  it('runs twice without a second grant (idempotent)', async () => {
    runSql(schema, migrationSql(MIGRATION));
    expect(await holders()).toEqual([{ key: 'system_admin', scopes: ['all'] }]);
  });
});
