import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_ROLES, SEED_ADMIN_ROLES } from '@school-erp/shared';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The P2 migration (roles as data): replays the real migration files in a throwaway schema of the
 * e2e database — the migrations before P2, existing HR admins (one linked to an employee through
 * HR's old `employees.user_id`), then the P2 migration and every later one (they add keys to the
 * starting roles) — and checks the seeded roles against
 * `BUILT_IN_ROLES` (the spec table) and how existing users were mapped.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const P2 = '20261117180000_roles_as_data';
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) =>
  readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const all = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n))
  .sort();
const before = all.filter((n) => n < P2);
/** Later migrations grant new keys to the starting roles (e.g. accounting, §10): replay them too. */
const after = all.filter((n) => n > P2);

function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const U1 = '11111111-1111-4111-8111-0000000000a1';
const U2 = '11111111-1111-4111-8111-0000000000a2';
const EMP = '66666666-6666-4666-8666-000000000001';

describe('roles as data (P2 migration, e2e)', () => {
  const schema = `p2_roles_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  beforeAll(() => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    // Two existing HR admins (the only role before P2); U2 is linked to an employee.
    runSql(
      schema,
      `INSERT INTO "users" ("id","email","password_hash","name","updated_at") VALUES
         ('${U1}','admin@x.test','x','Admin One',now()), ('${U2}','hr@x.test','x','Admin Two',now());
       INSERT INTO "stages" ("id","name_en","name_ar","updated_at")
         VALUES ('22222222-2222-4222-8222-0000000000a1','Primary','ابتدائي',now());
       INSERT INTO "departments" ("id","name_en","name_ar","updated_at")
         VALUES ('33333333-3333-4333-8333-0000000000a1','Science','علوم',now());
       INSERT INTO "job_titles" ("id","name_en","name_ar","updated_at")
         VALUES ('44444444-4444-4444-8444-0000000000a1','Teacher','معلم',now());
       INSERT INTO "employees" ("id","code","name_en","name_ar","gender","date_of_birth","phone",
         "hire_date","stage_id","department_id","job_title_id","work_system","basic_salary",
         "contract_start","contract_end","user_id","updated_at")
       VALUES ('${EMP}','EMP-0001','Mona','منى','FEMALE','1990-01-01','010','2020-01-01',
         '22222222-2222-4222-8222-0000000000a1','33333333-3333-4333-8333-0000000000a1',
         '44444444-4444-4444-8444-0000000000a1','FULL_TIME',1000000,'2026-06-01','2027-05-31',
         '${U2}',now());`,
    );
    runSql(schema, migrationSql(P2));
    for (const m of after) runSql(schema, migrationSql(m));
    db = clientForSchema(schema);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('seeds the starting roles exactly as BUILT_IN_ROLES (the spec table): keys, names, permissions, scopes', async () => {
    const roles = await db.role.findMany({
      select: {
        key: true,
        nameEn: true,
        nameAr: true,
        builtIn: true,
        permissions: { select: { permissionKey: true, scope: true } },
      },
    });
    const stored = Object.fromEntries(
      roles.map((r) => [
        r.key,
        {
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          builtIn: r.builtIn,
          permissions: Object.fromEntries(r.permissions.map((p) => [p.permissionKey, p.scope])),
        },
      ]),
    );
    const expected = Object.fromEntries(
      BUILT_IN_ROLES.map((r) => [
        r.key,
        { nameEn: r.nameEn, nameAr: r.nameAr, builtIn: true, permissions: r.permissions },
      ]),
    );
    expect(stored).toEqual(expected);
  });

  it('every existing HR admin becomes System admin + HR manager — and nothing else', async () => {
    const rows = await db.userRoleAssignment.findMany({
      select: { userId: true, role: { select: { key: true } } },
    });
    const byUser = (id: string) =>
      rows
        .filter((r) => r.userId === id)
        .map((r) => r.role.key)
        .sort();
    expect(byUser(U1)).toEqual([...SEED_ADMIN_ROLES].sort());
    expect(byUser(U2)).toEqual([...SEED_ADMIN_ROLES].sort());
    expect(rows).toHaveLength(4);
  });

  it('copies HR’s employee link onto the user (core-owned) and flags nobody to change their password', async () => {
    const users = await db.user.findMany({
      select: { id: true, employeeId: true, mustChangePassword: true },
      orderBy: { email: 'asc' },
    });
    expect(users).toEqual([
      { id: U1, employeeId: null, mustChangePassword: false },
      { id: U2, employeeId: EMP, mustChangePassword: false },
    ]);
  });
});
