import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_ROLES, SYSTEM_ADMIN_ROLE } from '@school-erp/shared';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * A school may delete any unused starting role but the System admin (owner, 2026-11-19). Later
 * migrations grant new permissions to starting roles by key (the payroll tax rule, the outbox
 * retry, notification settings…), so each must skip a role that is gone — no error, and no role
 * brought back. Replays the real migration files in a throwaway schema: up to the roles migration,
 * then deletes every starting role but the System admin, then runs every later migration — the
 * ones written since and any added from now on.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const ROLES_MIGRATION = '20261117180000_roles_as_data';
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) =>
  readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const all = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n))
  .sort();
const upToRoles = all.filter((n) => n <= ROLES_MIGRATION);
const later = all.filter((n) => n > ROLES_MIGRATION);
const deletedKeys = BUILT_IN_ROLES.map((r) => r.key).filter((k) => k !== SYSTEM_ADMIN_ROLE);

function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** The first later migration that fails when replayed one by one in a fresh schema (diagnosis only). */
function failingMigration(): string | null {
  const probe = `deleted_roles_probe_${Date.now()}`;
  try {
    for (const m of upToRoles) runSql(probe, `CREATE SCHEMA IF NOT EXISTS "${probe}";\n${migrationSql(m)}`);
    const list = deletedKeys.map((k) => `'${k}'`).join(', ');
    runSql(probe, `DELETE FROM "roles" WHERE "key" IN (${list});`);
    for (const m of later) {
      try {
        runSql(probe, migrationSql(m));
      } catch {
        return m;
      }
    }
    return null;
  } finally {
    runSql('public', `DROP SCHEMA IF EXISTS "${probe}" CASCADE;`);
  }
}

describe('grant migrations after a starting role was deleted (migration, e2e)', () => {
  const schema = `deleted_roles_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  beforeAll(async () => {
    for (const m of upToRoles) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    db = clientForSchema(schema);
    // What `DELETE /roles/:id` does: the role row goes, its grants with it (cascade).
    const list = deletedKeys.map((k) => `'${k}'`).join(', ');
    runSql(schema, `DELETE FROM "roles" WHERE "key" IN (${list});`);
    expect((await db.role.findMany({ select: { key: true } })).map((r) => r.key)).toEqual([
      SYSTEM_ADMIN_ROLE,
    ]);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('the later migrations include grants to the deleted roles (the case under test)', () => {
    const grantsByKey = later.filter((m) =>
      deletedKeys.some((k) => migrationSql(m).includes(`('${k}', '`)),
    );
    expect(grantsByKey).toEqual(
      expect.arrayContaining([
        '20261118170000_accounting_settings_grants',
        '20261118180000_accounting_payroll',
        '20261119010000_notifications',
      ]),
    );
  });

  it('every later migration runs without an error and brings no deleted role back', async () => {
    // One `prisma db execute` for all of them, in order: a process per migration costs about a
    // second each, and "every later migration" grows with every migration added (it passed the
    // 30 s test timeout at 2026-11-22's). On a failure, replay them one by one in a fresh schema
    // to name the migration that broke.
    try {
      runSql(schema, later.map(migrationSql).join('\n;\n'));
    } catch (e) {
      throw new Error(`a later migration failed: ${failingMigration() ?? 'not reproduced one by one'} — ${String(e)}`);
    }
    const roles = await db.role.findMany({ select: { key: true } });
    expect(roles.map((r) => r.key)).toEqual([SYSTEM_ADMIN_ROLE]);
    // Every grant those migrations made belongs to a role that still exists.
    const grants = await db.rolePermission.findMany({ select: { role: { select: { key: true } } } });
    expect(new Set(grants.map((g) => g.role.key))).toEqual(new Set([SYSTEM_ADMIN_ROLE]));
    // …and the System admin still got its own (the outbox retry, #119).
    expect(
      await db.rolePermission.count({ where: { permissionKey: 'core.outbox.manage' } }),
    ).toBe(1);
  });
});
