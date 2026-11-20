import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * N0's migration (`employees.probation_end`): replays the real migration files in a throwaway
 * schema — everything before N0, then employees hired on awkward dates, then the N0 migration — and
 * checks every existing employee is backfilled with hire date + 3 months, the day before, exactly as
 * the shared `defaultProbationEnd` fills a new one.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const N0 = '20261119001000_employee_probation_end';
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const before = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n) && n < N0)
  .sort();

function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const E = (n: number) => `77777777-7777-4777-8777-00000000000${n}`;
const STAGE = '22222222-2222-4222-8222-0000000000b1';
const DEPT = '33333333-3333-4333-8333-0000000000b1';
const TITLE = '44444444-4444-4444-8444-0000000000b1';

/** Hire dates and the probation end each must get (hire + 3 months − 1 day; a missing day clamps). */
const CASES: [hire: string, end: string][] = [
  ['2026-09-01', '2026-11-30'],
  ['2026-11-30', '2027-02-27'],
  ['2026-08-31', '2026-11-29'],
  ['2020-01-15', '2020-04-14'],
];

const employee = (n: number, hire: string) =>
  `('${E(n)}','EMP-000${n}','E${n}','م${n}','FEMALE','1990-01-01','010','${hire}','${STAGE}','${DEPT}',
    '${TITLE}','FULL_TIME',1000000,'2026-06-01','2027-05-31',now())`;

describe('employees.probation_end backfill (N0 migration, e2e)', () => {
  const schema = `n0_probation_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  beforeAll(() => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    runSql(
      schema,
      `INSERT INTO "stages" ("id","name_en","name_ar","updated_at") VALUES ('${STAGE}','Primary','ابتدائي',now());
       INSERT INTO "departments" ("id","name_en","name_ar","updated_at") VALUES ('${DEPT}','Science','علوم',now());
       INSERT INTO "job_titles" ("id","name_en","name_ar","updated_at") VALUES ('${TITLE}','Teacher','معلم',now());
       INSERT INTO "employees" ("id","code","name_en","name_ar","gender","date_of_birth","phone",
         "hire_date","stage_id","department_id","job_title_id","work_system","basic_salary",
         "contract_start","contract_end","updated_at")
       VALUES ${CASES.map(([hire], i) => employee(i + 1, hire)).join(', ')};`,
    );
    runSql(schema, migrationSql(N0));
    db = clientForSchema(schema);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('every existing employee gets hire date + 3 months, the day before', async () => {
    const rows = await db.employee.findMany({ select: { probationEnd: true }, orderBy: { code: 'asc' } });
    expect(rows.map((r) => r.probationEnd?.toISOString().slice(0, 10))).toEqual(CASES.map(([, end]) => end));
  });

  it('the column is a nullable date (empty = no probation)', async () => {
    const rows = await db.$queryRaw<{ data_type: string; is_nullable: string }[]>`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = 'employees' AND column_name = 'probation_end'`;
    expect(rows).toEqual([{ data_type: 'date', is_nullable: 'YES' }]);
  });
});
