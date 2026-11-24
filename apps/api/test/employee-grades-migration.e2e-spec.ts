import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The grades migration (§3, owner 2026-11-24): replays the real migration files in a throwaway
 * schema — everything before it, then employees whose free-text grades repeat, differ only by
 * spaces, are blank or missing — then the migration, and checks each distinct trimmed text became
 * one grade (the same text in English and Arabic, in alphabetical order), every employee points at
 * theirs, blank and missing ones have none, and the text column is gone.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const GRADES = '20261124200000_employee_grades';
const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const before = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n) && n < GRADES)
  .sort();

function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const E = (n: number) => `99999999-9999-4999-8999-00000000000${n}`;
const STAGE = '22222222-2222-4222-8222-0000000000d1';
const DEPT = '33333333-3333-4333-8333-0000000000d1';
const TITLE = '44444444-4444-4444-8444-0000000000d1';

/** Each employee's old grade text, and the grade name it must end up with (null = none). */
const CASES: [text: string | null, grade: string | null][] = [
  ['Senior', 'Senior'],
  ['  Senior ', 'Senior'],
  ['الدرجة الثالثة', 'الدرجة الثالثة'],
  ['Junior', 'Junior'],
  ['', null],
  ['   ', null],
  [null, null],
];

const sqlText = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
const employee = (n: number, text: string | null) =>
  `('${E(n)}','EMP-000${n}','E${n}','م${n}','FEMALE','1990-01-01','010','2020-01-01','${STAGE}','${DEPT}',
    '${TITLE}',${sqlText(text)},'FULL_TIME',1000000,'2026-06-01','2027-05-31',now())`;

describe('employees.grade → grades (grades migration, e2e)', () => {
  const schema = `grades_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
         "hire_date","stage_id","department_id","job_title_id","grade","work_system","basic_salary",
         "contract_start","contract_end","updated_at")
       VALUES ${CASES.map(([text], i) => employee(i + 1, text)).join(', ')};`,
    );
    runSql(schema, migrationSql(GRADES));
    db = clientForSchema(schema);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('one grade per distinct trimmed text, same name in both languages, shown, in alphabetical order', async () => {
    const grades = await db.grade.findMany({
      select: { nameEn: true, nameAr: true, isActive: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
    const names = [...new Set(CASES.map(([, g]) => g).filter((g): g is string => g !== null))].sort();
    expect(grades.map((g) => g.nameEn)).toEqual(names);
    expect(grades.every((g) => g.nameAr === g.nameEn && g.isActive)).toBe(true);
    expect(grades.map((g) => g.sortOrder)).toEqual(names.map((_, i) => i + 1));
  });

  it('every employee points at the grade of their old text; blank and missing ones have none', async () => {
    const rows = await db.employee.findMany({
      select: { code: true, grade: { select: { nameEn: true } } },
      orderBy: { code: 'asc' },
    });
    expect(rows.map((r) => r.grade?.nameEn ?? null)).toEqual(CASES.map(([, g]) => g));
  });

  it('the text column is gone, and a grade in use cannot be deleted (Restrict)', async () => {
    const columns = await db.$queryRaw<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = 'employees' AND column_name IN ('grade', 'grade_id')`;
    expect(columns).toEqual([{ column_name: 'grade_id', is_nullable: 'YES' }]);
    const used = await db.grade.findFirstOrThrow({ where: { nameEn: 'Junior' } });
    await expect(db.grade.delete({ where: { id: used.id } })).rejects.toThrow();
  });

  it('the grade search columns are filled by the database', async () => {
    const rows = await db.grade.findMany({ where: { nameEn: 'Junior' }, omit: { searchText: false } });
    expect(rows[0]?.searchText).toBeTruthy();
  });
});
