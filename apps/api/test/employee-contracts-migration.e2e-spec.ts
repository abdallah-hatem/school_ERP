import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The contracts migration (spec 2026-11-24 → Data): replays the real migration files in a throwaway
 * schema — everything before it, then employees with their contract dates (a mid-year one and an
 * inactive one), then the migration — and checks each existing employee gets exactly one contract
 * from their current dates, active, and that a second active contract is refused by the database.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const CONTRACTS = '20261124100000_employee_contracts';
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const before = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n) && n < CONTRACTS)
  .sort();

function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const E = (n: number) => `88888888-8888-4888-8888-00000000000${n}`;
const STAGE = '22222222-2222-4222-8222-0000000000c1';
const DEPT = '33333333-3333-4333-8333-0000000000c1';
const TITLE = '44444444-4444-4444-8444-0000000000c1';

/** Each employee's contract dates and status. */
const CASES: [start: string, end: string, status: string][] = [
  ['2026-06-01', '2027-05-31', 'ACTIVE'],
  ['2025-09-01', '2026-08-31', 'ACTIVE'],
  ['2024-06-01', '2025-05-31', 'INACTIVE'],
];

const employee = (n: number, [start, end, status]: (typeof CASES)[number]) =>
  `('${E(n)}','EMP-000${n}','E${n}','م${n}','FEMALE','1990-01-01','010','2020-01-01','${STAGE}','${DEPT}',
    '${TITLE}','FULL_TIME',1000000,'${start}','${end}','${status}',now())`;

describe('employee_contracts backfill (contracts migration, e2e)', () => {
  const schema = `contracts_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
         "contract_start","contract_end","status","updated_at")
       VALUES ${CASES.map((c, i) => employee(i + 1, c)).join(', ')};`,
    );
    runSql(schema, migrationSql(CONTRACTS));
    db = clientForSchema(schema);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('every existing employee gets one contract from their current dates, with no decision', async () => {
    const rows = await db.employeeContract.findMany({
      select: { employeeId: true, startsOn: true, endsOn: true, status: true, decidedById: true },
      orderBy: { employeeId: 'asc' },
    });
    expect(
      rows.map((r) => [r.employeeId, r.startsOn.toISOString().slice(0, 10), r.endsOn.toISOString().slice(0, 10), r.status, r.decidedById]),
    ).toEqual(CASES.map(([start, end], i) => [E(i + 1), start, end, 'ACTIVE', null]));
  });

  it('one active contract per employee: the database refuses a second', async () => {
    await expect(
      db.employeeContract.create({
        data: { employeeId: E(1), startsOn: new Date('2027-06-01'), endsOn: new Date('2028-05-31') },
      }),
    ).rejects.toThrow();
  });
});
