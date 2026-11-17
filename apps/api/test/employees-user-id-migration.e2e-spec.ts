import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The P4 migration (drop HR's deprecated `employees.user_id`): replays the real migration files in a
 * throwaway schema — everything before P4, then links set up the way P2 could have missed them, then
 * the P4 migration — and checks that no link is lost, none is overwritten, and the column is gone.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const P4 = '20261118160000_employees_drop_user_id';
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const before = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n) && n < P4)
  .sort();

function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const U = (n: number) => `11111111-1111-4111-8111-00000000000${n}`;
const E = (n: number) => `66666666-6666-4666-8666-00000000000${n}`;
const STAGE = '22222222-2222-4222-8222-0000000000a1';
const DEPT = '33333333-3333-4333-8333-0000000000a1';
const TITLE = '44444444-4444-4444-8444-0000000000a1';

const employee = (n: number, userId: string | null) =>
  `('${E(n)}','EMP-000${n}','E${n}','م${n}','FEMALE','1990-01-01','010','2020-01-01','${STAGE}','${DEPT}',
    '${TITLE}','FULL_TIME',1000000,'2026-06-01','2027-05-31',${userId ? `'${userId}'` : 'NULL'},now())`;

describe('employees.user_id dropped (P4 migration, e2e)', () => {
  const schema = `p4_user_id_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  beforeAll(() => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    runSql(
      schema,
      `INSERT INTO "users" ("id","email","password_hash","name","updated_at") VALUES
         ('${U(1)}','missed@x.test','x','Missed link',now()),
         ('${U(2)}','kept@x.test','x','Already linked',now()),
         ('${U(3)}','taken@x.test','x','Employee taken',now()),
         ('${U(4)}','holder@x.test','x','Holder',now());
       INSERT INTO "stages" ("id","name_en","name_ar","updated_at") VALUES ('${STAGE}','Primary','ابتدائي',now());
       INSERT INTO "departments" ("id","name_en","name_ar","updated_at") VALUES ('${DEPT}','Science','علوم',now());
       INSERT INTO "job_titles" ("id","name_en","name_ar","updated_at") VALUES ('${TITLE}','Teacher','معلم',now());
       INSERT INTO "employees" ("id","code","name_en","name_ar","gender","date_of_birth","phone",
         "hire_date","stage_id","department_id","job_title_id","work_system","basic_salary",
         "contract_start","contract_end","user_id","updated_at")
       VALUES ${employee(1, U(1))}, ${employee(2, U(2))}, ${employee(3, U(3))}, ${employee(4, null)};
       -- U2 already holds E4 through the new link: their old one (E2) must not overwrite it.
       UPDATE "users" SET "employee_id" = '${E(4)}' WHERE "id" = '${U(2)}';
       -- E3 is already held by U4: U3's old link to it can't be copied (one account per employee).
       UPDATE "users" SET "employee_id" = '${E(3)}' WHERE "id" = '${U(4)}';`,
    );
    runSql(schema, migrationSql(P4));
    db = clientForSchema(schema);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  const linkOf = async (id: string) =>
    (await db.user.findUniqueOrThrow({ where: { id }, select: { employeeId: true } })).employeeId;

  it('a link P2 missed (user unlinked, employee free) is copied into users.employee_id', async () => {
    expect(await linkOf(U(1))).toBe(E(1));
  });

  it('an existing users.employee_id is never overwritten', async () => {
    expect(await linkOf(U(2))).toBe(E(4));
  });

  it('an employee another user already holds is not given to a second account', async () => {
    expect(await linkOf(U(3))).toBeNull();
    expect(await linkOf(U(4))).toBe(E(3));
  });

  it('the column, its index and its foreign key are gone', async () => {
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = 'employees' AND column_name = 'user_id'`;
    expect(rows[0].n).toBe(0);
  });
});
