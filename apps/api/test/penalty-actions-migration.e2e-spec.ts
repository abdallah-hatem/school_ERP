import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SEEDED_PENALTY_ACTIONS } from '@school-erp/shared';
import type { DatabaseService } from '../src/database/database.service';
import { payslipPenaltyAmount } from '../src/modules/hr/domain';
import { ACTION_ID } from './helpers/penalty-actions';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The penalty actions migration (spec 2026-11-25 → "Migration of existing data") on a database
 * WITH data: replays the real migration files in a throwaway schema — everything before it, then a
 * catalogue whose levels use every old action (days on the day deductions and an investigation), a
 * penalty in each status, and an approved payroll run whose line priced two day penalties — then the
 * migration. Row counts don't change; every level and penalty points at the seeded row of its old
 * action and reads by the same name; the approved run's totals, nets and payslip amounts are what
 * they were (edge case 25).
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const MIGRATION = '20261126100000_penalty_actions';
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

const STAGE = '11111111-1111-4111-8111-1111111111a1';
const DEPT = '33333333-3333-4333-8333-3333333333a1';
const TITLE = '44444444-4444-4444-8444-4444444444a1';
const EMP = '22222222-2222-4222-8222-2222222222a1';
const GROUP = '55555555-5555-4555-8555-5555555555a1';
const V = (n: number) => `66666666-6666-4666-8666-6666666666${String(n).padStart(2, '0')}`;
const P = (n: number) => `77777777-7777-4777-8777-7777777777${String(n).padStart(2, '0')}`;
const RUN = '88888888-8888-4888-8888-8888888888a1';
const LINE = '99999999-9999-4999-8999-9999999999a1';

const CODES = SEEDED_PENALTY_ACTIONS.map((a) => a.code);
/** One violation per old action; the day ones with days (investigation's are optional). */
const DAYS: Record<string, string> = { DEDUCT_DAYS: '1.5', INVESTIGATION: '0.5' };
/** Penalties as they were: [id, violation index, status, action, days]. */
const PENALTIES: [string, number, string, string, string | null][] = [
  [P(1), 2, 'APPROVED', 'DEDUCT_DAYS', '1.5'],
  [P(2), 3, 'APPROVED', 'INVESTIGATION', '0.5'],
  [P(3), 0, 'APPROVED', 'NOTICE', null],
  [P(4), 1, 'WAITING_HR', 'WARNING', null],
  [P(5), 9, 'CANCELLED', 'DISMISSAL', null],
  [P(6), 4, 'REJECTED', 'RAISE_HALF_LOSS', null],
];

const DATA = `
INSERT INTO "stages" ("id","name_en","name_ar","updated_at") VALUES ('${STAGE}','Primary','ابتدائي',now());
INSERT INTO "departments" ("id","name_en","name_ar","updated_at") VALUES ('${DEPT}','Science','علوم',now());
INSERT INTO "job_titles" ("id","name_en","name_ar","updated_at") VALUES ('${TITLE}','Teacher','معلم',now());
INSERT INTO "employees" ("id","code","name_en","name_ar","gender","date_of_birth","phone","hire_date","stage_id",
  "department_id","job_title_id","work_system","basic_salary","contract_start","contract_end","updated_at")
VALUES ('${EMP}','EMP-9101','Nadia','نادية','FEMALE','1990-01-01','010','2015-09-01','${STAGE}','${DEPT}','${TITLE}',
  'FULL_TIME',900000,'2025-06-01','2026-05-31',now());
INSERT INTO "penalty_groups" ("id","name_en","name_ar","updated_at") VALUES ('${GROUP}','Table A','جدول أ',now());
${CODES.map(
  (c, i) => `INSERT INTO "violations" ("id","group_id","name_en","name_ar","updated_at") VALUES ('${V(i)}','${GROUP}','V ${c}','م ${c}',now());
INSERT INTO "violation_levels" ("id","violation_id","level","action","days") VALUES
  (gen_random_uuid(),'${V(i)}',1,'${c}',${DAYS[c] ? `'${DAYS[c]}'` : 'NULL'}),
  (gen_random_uuid(),'${V(i)}',2,'WARNING',NULL);`,
).join('\n')}
INSERT INTO "penalty_records" ("id","employee_id","violation_id","date","status","stage_id","level","action","days","updated_at") VALUES
${PENALTIES.map(([id, v, status, action, days], i) => `  ('${id}','${EMP}','${V(v)}','2025-11-${String(i + 2).padStart(2, '0')}','${status}','${STAGE}',1,'${action}',${days ? `'${days}'` : 'NULL'},now())`).join(',\n')};
INSERT INTO "payroll_runs" ("id","month","status","approved_at","updated_at") VALUES ('${RUN}','2025-11','APPROVED',now(),now());
INSERT INTO "payroll_lines" ("id","run_id","employee_id","employee_code","name_en","name_ar","department_id",
  "department_name_en","department_name_ar","basic_salary","work_system","month_salary","day_value","penalty_days",
  "penalty_amount","net","insurance_status","updated_at")
VALUES ('${LINE}','${RUN}','${EMP}','EMP-9101','Nadia','نادية','${DEPT}','Science','علوم',900000,'FULL_TIME',900000,30000,
  '2','60000',840000,'NOT_INSURED',now());
`;

describe('penalty actions on an existing database (migration, e2e)', () => {
  const schema = `penalty_actions_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;
  let counts: Record<string, number>;

  beforeAll(async () => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    runSql(schema, DATA);
    db = clientForSchema(schema);
    const [levels, penalties, lines] = await Promise.all([
      db.violationLevel.count(),
      db.penaltyRecord.count(),
      db.payrollLine.count(),
    ]);
    counts = { levels, penalties, lines };
    await db.$disconnect();
    runSql(schema, migrationSql(MIGRATION));
    db = clientForSchema(schema);
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('inserts the ten seeded actions with today’s names, effects, order and fixed ids', async () => {
    const rows = await db.penaltyAction.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, nameEn: true, nameAr: true, effect: true, percentBase: true, isActive: true },
    });
    expect(rows).toEqual(
      SEEDED_PENALTY_ACTIONS.map((a) => ({
        id: ACTION_ID[a.code],
        code: a.code,
        nameEn: a.nameEn,
        nameAr: a.nameAr,
        effect: a.effect,
        percentBase: null,
        isActive: true,
      })),
    );
  });

  it('row counts unchanged; every level and penalty has an action', async () => {
    expect({
      levels: await db.violationLevel.count(),
      penalties: await db.penaltyRecord.count(),
      lines: await db.payrollLine.count(),
    }).toEqual(counts);
    expect(counts).toEqual({ levels: 20, penalties: PENALTIES.length, lines: 1 });
  });

  it('each level points at the seeded row of its old action; days stay where they are', async () => {
    const levels = await db.violationLevel.findMany({
      where: { level: 1 },
      select: { violationId: true, actionId: true, days: true, percent: true, amount: true },
    });
    for (const [i, code] of CODES.entries()) {
      const l = levels.find((x) => x.violationId === V(i))!;
      expect(l.actionId).toBe(ACTION_ID[code]);
      expect(l.days === null ? null : Number(l.days)).toBe(DAYS[code] ? Number(DAYS[code]) : null);
      expect([l.percent, l.amount]).toEqual([null, null]);
    }
  });

  it('every penalty keeps its level and days; its snapshot reads by the same name and effect', async () => {
    const rows = await db.penaltyRecord.findMany({
      select: { id: true, status: true, level: true, actionId: true, actionNameEn: true, actionNameAr: true, effect: true, percentBase: true, days: true, percent: true, amount: true },
    });
    for (const [id, , status, code, days] of PENALTIES) {
      const seeded = SEEDED_PENALTY_ACTIONS.find((a) => a.code === code)!;
      const r = rows.find((x) => x.id === id)!;
      expect({ ...r, days: r.days === null ? null : Number(r.days) }).toEqual({
        id,
        status,
        level: 1,
        actionId: ACTION_ID[seeded.code],
        actionNameEn: seeded.nameEn,
        actionNameAr: seeded.nameAr,
        effect: seeded.effect,
        percentBase: null,
        days: days === null ? null : Number(days),
        percent: null,
        amount: null,
      });
    }
  });

  it('edge case 25: the approved run’s line keeps its totals and net; penalty_days_amount = penalty_amount; its payslip amounts read as before', async () => {
    const line = await db.payrollLine.findUniqueOrThrow({
      where: { id: LINE },
      select: { penaltyDays: true, penaltyAmount: true, penaltyDaysAmount: true, net: true, monthSalary: true, basicSalary: true },
    });
    expect({ ...line, penaltyDays: Number(line.penaltyDays) }).toEqual({
      penaltyDays: 2,
      penaltyAmount: 60_000,
      penaltyDaysAmount: 60_000,
      net: 840_000,
      monthSalary: 900_000,
      basicSalary: 900_000,
    });
    // The payslip's per-penalty amounts, as the payslip works them out now: 1.5 and 0.5 of 2 days.
    const approved = await db.penaltyRecord.findMany({
      where: { status: 'APPROVED' },
      orderBy: { date: 'asc' },
      select: { effect: true, percentBase: true, days: true, percent: true, amount: true },
    });
    const amounts = approved.map((p) =>
      payslipPenaltyAmount(
        { effect: p.effect, percentBase: p.percentBase, days: p.days === null ? null : Number(p.days), percent: null, amount: p.amount },
        { ...line, penaltyDays: Number(line.penaltyDays) },
      ),
    );
    expect(amounts).toEqual([45_000, 15_000, 0]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(line.penaltyAmount);
  });

  it('the old enum is gone; the rules the migration adds hold (base only for %, names unique in any case)', async () => {
    await expect(
      db.$executeRaw`INSERT INTO "penalty_actions" ("id","name_en","name_ar","effect","updated_at") VALUES (gen_random_uuid(),'X %','س %','DEDUCT_PERCENT',now())`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`INSERT INTO "penalty_actions" ("id","name_en","name_ar","effect","updated_at") VALUES (gen_random_uuid(),'WARNING','إنذار آخر','RECORD_ONLY',now())`,
    ).rejects.toThrow();
    const types = await db.$queryRaw<{ typname: string }[]>`
      SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = ${schema} AND t.typname = 'PenaltyAction'`;
    expect(types).toEqual([]);
  });
});
