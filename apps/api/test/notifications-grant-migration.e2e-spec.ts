import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_ROLES, type PermissionKey } from '@school-erp/shared';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The notifications migration grants Settings → Notifications on existing databases (owner,
 * 2026-11-18): the System admin views and manages it, the HR manager only views it. Roles are data,
 * so an existing database — the demo DB, every school's — gets them only from this migration.
 * Replays the real migration files in a throwaway schema: everything before it, then the migration,
 * then its grant statement again.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const MIGRATION = '20261119010000_notifications';
const KEYS: PermissionKey[] = ['core.notifications.view', 'core.notifications.manage'];
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) =>
  readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
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

describe('notification settings granted on existing databases (migration, e2e)', () => {
  const schema = `notif_grant_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  const grants = async () =>
    (
      await db.rolePermission.findMany({
        where: { permissionKey: { in: KEYS } },
        select: { permissionKey: true, scope: true, role: { select: { key: true } } },
      })
    )
      .map((g) => `${g.role.key}:${g.permissionKey}:${g.scope}`)
      .sort();

  const expected = BUILT_IN_ROLES.flatMap((r) =>
    KEYS.flatMap((k) => (r.permissions[k] ? [`${r.key}:${k}:${r.permissions[k]}`] : [])),
  ).sort();

  beforeAll(async () => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    db = clientForSchema(schema);
    expect(await grants()).toEqual([]);
    runSql(schema, migrationSql(MIGRATION));
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('the System admin views and manages; the HR manager only views — as BUILT_IN_ROLES says', async () => {
    expect(expected).toEqual([
      'hr_manager:core.notifications.view:all',
      'system_admin:core.notifications.manage:all',
      'system_admin:core.notifications.view:all',
    ]);
    expect(await grants()).toEqual(expected);
  });

  it('the tables exist and the grants are idempotent', async () => {
    expect(await db.notification.count()).toBe(0);
    // The tables can't be created twice; replay only the grant statement.
    const sql = migrationSql(MIGRATION);
    runSql(schema, sql.slice(sql.indexOf('INSERT INTO "role_permissions"')));
    expect(await grants()).toEqual(expected);
  });
});
