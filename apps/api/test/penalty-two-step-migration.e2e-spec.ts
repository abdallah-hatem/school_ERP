import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_ROLES } from '@school-erp/shared';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The migration `penalty_two_step` (§3, §4, owner 2026-11-21) on an existing database (edge case
 * 14): every PENDING penalty becomes WAITING_HR (nothing already pending needs a new review) and is
 * approvable at once; APPROVED and CANCELLED are untouched; every penalty gets its employee's stage;
 * the Stage head role gets `hr.penalties.review` at own_stage. Replays the real migration files in a
 * throwaway schema: everything before it, data as it was then, then the migration.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const MIGRATION = '20261121160000_penalty_two_step';
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

const STAGE = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '22222222-2222-4222-8222-222222222222';
const VIOLATION = '33333333-3333-4333-8333-333333333333';
const P = {
  pending: '44444444-4444-4444-8444-444444444441',
  approved: '44444444-4444-4444-8444-444444444442',
  cancelled: '44444444-4444-4444-8444-444444444443',
};

/** A database as it was before the migration: one employee, one violation, a penalty in each old status. */
const DATA = `
INSERT INTO "stages" ("id", "name_en", "name_ar", "updated_at") VALUES ('${STAGE}', 'Primary', 'الابتدائية', now());
INSERT INTO "departments" ("id", "name_en", "name_ar", "updated_at") VALUES (gen_random_uuid(), 'Maths', 'الرياضيات', now());
INSERT INTO "job_titles" ("id", "name_en", "name_ar", "updated_at") VALUES (gen_random_uuid(), 'Teacher', 'معلم', now());
INSERT INTO "employees" ("id", "code", "name_en", "name_ar", "gender", "date_of_birth", "phone", "hire_date", "stage_id",
  "department_id", "job_title_id", "work_system", "basic_salary", "contract_start", "contract_end", "updated_at")
SELECT '${EMPLOYEE}', 'EMP-9001', 'Omar', 'عمر', 'MALE', '1990-01-01', '01000000000', '2015-09-01', '${STAGE}',
  (SELECT "id" FROM "departments" LIMIT 1), (SELECT "id" FROM "job_titles" LIMIT 1), 'FULL_TIME', 1000000,
  '2025-06-01', '2026-05-31', now();
INSERT INTO "penalty_groups" ("id", "name_en", "name_ar", "updated_at") VALUES (gen_random_uuid(), 'Table A', 'جدول أ', now());
INSERT INTO "violations" ("id", "group_id", "name_en", "name_ar", "updated_at")
SELECT '${VIOLATION}', (SELECT "id" FROM "penalty_groups" LIMIT 1), 'Late', 'تأخير', now();
INSERT INTO "penalty_records" ("id", "employee_id", "violation_id", "date", "status", "level", "action", "updated_at") VALUES
  ('${P.pending}', '${EMPLOYEE}', '${VIOLATION}', '2025-11-03', 'PENDING', 1, 'NOTICE', now()),
  ('${P.approved}', '${EMPLOYEE}', '${VIOLATION}', '2025-11-02', 'APPROVED', 1, 'NOTICE', now()),
  ('${P.cancelled}', '${EMPLOYEE}', '${VIOLATION}', '2025-11-01', 'CANCELLED', 1, 'NOTICE', now());
`;

describe('penalty_two_step on existing databases (migration, e2e)', () => {
  const schema = `penalty_two_step_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  beforeAll(() => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    runSql(schema, DATA);
    runSql(schema, migrationSql(MIGRATION));
    db = clientForSchema(schema);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('existing Pending penalties become Waiting for HR; Approved and Cancelled are unchanged', async () => {
    const rows = await db.penaltyRecord.findMany({ select: { id: true, status: true, level: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(P.pending)?.status).toBe('WAITING_HR');
    expect(byId.get(P.approved)).toMatchObject({ status: 'APPROVED', level: 1 });
    expect(byId.get(P.cancelled)).toMatchObject({ status: 'CANCELLED', level: 1 });
  });

  it('every penalty gets its employee’s stage, and no review data (none happened)', async () => {
    const rows = await db.penaltyRecord.findMany({
      select: { stageId: true, reviewSkip: true, reviewedAt: true, rejectedAt: true },
    });
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toEqual({ stageId: STAGE, reviewSkip: null, reviewedAt: null, rejectedAt: null });
  });

  it('the new statuses exist: a migrated one can move on (approvable at the HR step)', async () => {
    await db.penaltyRecord.update({ where: { id: P.pending }, data: { status: 'APPROVED' } });
    await db.penaltyRecord.update({ where: { id: P.pending }, data: { status: 'REJECTED' } });
    await db.penaltyRecord.update({ where: { id: P.pending }, data: { status: 'PENDING_REVIEW' } });
    expect((await db.penaltyRecord.findUniqueOrThrow({ where: { id: P.pending } })).status).toBe('PENDING_REVIEW');
  });

  it('employees have no other stages yet ("also teaches in" starts empty)', async () => {
    expect(await db.employeeStage.count()).toBe(0);
  });

  it('the Stage head gets hr.penalties.review at own_stage and the System admin at all, as BUILT_IN_ROLES says — and no other role', async () => {
    const holders = await db.role.findMany({
      where: { permissions: { some: { permissionKey: 'hr.penalties.review' } } },
      select: { key: true, permissions: { where: { permissionKey: 'hr.penalties.review' }, select: { scope: true } } },
    });
    const expected = BUILT_IN_ROLES.filter((r) => r.permissions['hr.penalties.review'])
      .map((r) => ({ key: r.key, permissions: [{ scope: r.permissions['hr.penalties.review'] }] }))
      .sort((a, b) => a.key.localeCompare(b.key));
    expect(expected).toEqual([
      { key: 'stage_head', permissions: [{ scope: 'own_stage' }] },
      { key: 'system_admin', permissions: [{ scope: 'all' }] },
    ]);
    expect([...holders].sort((a, b) => a.key.localeCompare(b.key))).toEqual(expected);
  });
});
