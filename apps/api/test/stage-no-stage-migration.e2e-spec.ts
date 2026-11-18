import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * The migration that adds `stages.is_no_stage` (the "no stage" entry, §3): replays the real migration
 * files in a throwaway schema — everything before it, then stages as an existing school has them,
 * then the migration — and checks that the stage the old code recognised by name ("None", any case
 * or spacing) is the one marked, and only it.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const MIGRATION = '20261118210000_stage_no_stage_flag';
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

const S = (n: number) => `22222222-2222-4222-8222-00000000000${n}`;

describe('stages.is_no_stage added (migration, e2e)', () => {
  const schema = `no_stage_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let db: DatabaseService;

  beforeAll(() => {
    for (const m of before) {
      runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
    }
    runSql(
      schema,
      `INSERT INTO "stages" ("id","name_en","name_ar","sort_order","updated_at") VALUES
         ('${S(1)}','Kindergarten','رياض الأطفال',0,now()),
         ('${S(2)}','Primary','ابتدائي',1,now()),
         ('${S(3)}',' none ','بدون مرحلة',3,now()),
         ('${S(4)}','None','بدون مرحلة (مكرر)',4,now()),
         ('${S(5)}','Nonexistent','—',2,now());`,
    );
    runSql(schema, migrationSql(MIGRATION));
    db = clientForSchema(schema);
  });

  afterAll(async () => {
    await db?.$disconnect();
    runSql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  });

  it('marks the stage named "None" (trimmed, any case) — the first in stage order — and no other', async () => {
    const marked = await db.stage.findMany({ where: { isNoStage: true }, select: { id: true } });
    expect(marked).toEqual([{ id: S(3) }]);
  });

  it('every other stage starts unmarked, and names are left as they were', async () => {
    const rows = await db.stage.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { nameEn: true, isNoStage: true },
    });
    expect(rows).toEqual([
      { nameEn: 'Kindergarten', isNoStage: false },
      { nameEn: 'Primary', isNoStage: false },
      { nameEn: 'Nonexistent', isNoStage: false },
      { nameEn: ' none ', isNoStage: true },
      { nameEn: 'None', isNoStage: false },
    ]);
  });

  it('a stage added later defaults to unmarked', async () => {
    const added = await db.stage.create({
      data: { nameEn: 'Secondary', nameAr: 'ثانوي' },
      select: { isNoStage: true },
    });
    expect(added.isNoStage).toBe(false);
  });
});
