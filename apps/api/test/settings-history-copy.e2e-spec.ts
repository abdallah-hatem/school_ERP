import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseService } from '../src/database/database.service';
import { clientForSchema, e2eDatabaseUrl } from './helpers/setup-db';

/*
 * D9 / edge case 11 — the T27 migration copies every `setting_changes` row into `audit_entries`
 * and only then drops the old table. This replays the real migration files in a throwaway
 * schema of the e2e database: the migrations before T27, a realistic old history, then the T27
 * migration — and checks count, values, people and times row by row.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const T27 = '20261117150000_audit_entries';

const dbUrl = e2eDatabaseUrl();

const migrationSql = (name: string) =>
  readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const before = readdirSync(MIGRATIONS)
  .filter((n) => /^\d{14}_/.test(n) && n < T27)
  .sort();

/** Runs a multi-statement SQL script in `schema` (the scripts use unqualified names). */
function runSql(schema: string, sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--url', dbUrl], {
    cwd: join(__dirname, '..'),
    input: `SET search_path TO "${schema}";\n${sql}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const U1 = '11111111-1111-4111-8111-000000000001';
const U2 = '11111111-1111-4111-8111-000000000002';
const STAGE = '22222222-2222-4222-8222-000000000001';
const DEPT = '33333333-3333-4333-8333-000000000001';
const GROUP = '44444444-4444-4444-8444-000000000001';
const VIOL = '55555555-5555-4555-8555-000000000001';

const dept = (nameEn: string) =>
  JSON.stringify({ id: DEPT, nameEn, nameAr: 'العلوم', sortOrder: 1, isActive: true });

/** The old history: every scope and key shape, SQL NULL and JSON null old values, no actor. */
const OLD_ROWS: Array<
  [
    id: string,
    key: string,
    scope: string,
    oldV: string | null,
    newV: string,
    by: string | null,
    at: string,
  ]
> = [
  [
    'a0000000-0000-4000-8000-000000000001',
    'school.workStart',
    'SCHOOL',
    '"07:30"',
    '"08:00"',
    U1,
    '2026-10-01 08:00:00.123',
  ],
  [
    'a0000000-0000-4000-8000-000000000002',
    'school.logoUrl',
    'SCHOOL',
    'null',
    '"/files/logo/a.png"',
    U1,
    '2026-10-01 08:05:00',
  ],
  [
    'a0000000-0000-4000-8000-000000000003',
    'school.workingDays',
    'SCHOOL',
    null,
    '["SUNDAY","MONDAY"]',
    null,
    '2026-10-02 09:00:00',
  ],
  [
    'a0000000-0000-4000-8000-000000000004',
    'hr.payroll.partTime',
    'HR',
    '{"PART_TIME_4":80}',
    '{"PART_TIME_4":75}',
    U2,
    '2026-10-03 10:00:00',
  ],
  [
    'a0000000-0000-4000-8000-000000000005',
    `lists.stages.${STAGE}`,
    'LISTS',
    'null',
    JSON.stringify({
      id: STAGE,
      nameEn: 'Primary',
      nameAr: 'ابتدائي',
      sortOrder: 1,
      isActive: true,
    }),
    U1,
    '2026-10-04 11:00:00',
  ],
  [
    'a0000000-0000-4000-8000-000000000006',
    'hr.departments',
    'LISTS',
    'null',
    dept('Science'),
    U1,
    '2026-10-05 12:00:00',
  ],
  [
    'a0000000-0000-4000-8000-000000000007',
    'hr.departments',
    'LISTS',
    dept('Science'),
    dept('Sciences'),
    U2,
    '2026-10-05 12:00:00',
  ],
  [
    'a0000000-0000-4000-8000-000000000008',
    'hr.jobTitles',
    'LISTS',
    'null',
    JSON.stringify({ id: DEPT, nameEn: 'Teacher', nameAr: 'معلم', sortOrder: 1, isActive: true }),
    U1,
    '2026-10-06 13:00:00',
  ],
  [
    'a0000000-0000-4000-8000-000000000009',
    'hr.penaltyGroups',
    'CATALOGUE',
    'null',
    JSON.stringify({ id: GROUP, nameEn: 'Table A', nameAr: 'أ', sortOrder: 1, isActive: true }),
    U1,
    '2026-10-07 14:00:00',
  ],
  [
    'a0000000-0000-4000-8000-00000000000a',
    'hr.violations',
    'CATALOGUE',
    JSON.stringify({
      id: VIOL,
      groupId: GROUP,
      nameEn: 'Late',
      nameAr: 'تأخير',
      note: null,
      isActive: true,
      levels: [],
    }),
    JSON.stringify({
      id: VIOL,
      groupId: GROUP,
      nameEn: 'Late',
      nameAr: 'تأخير',
      note: null,
      isActive: false,
      levels: [],
    }),
    U2,
    '2026-10-08 15:00:00',
  ],
];

const literal = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'::jsonb`);

function seedOldHistory(schema: string, rows = OLD_ROWS): void {
  const users = `INSERT INTO "users" ("id","email","password_hash","name","updated_at") VALUES
    ('${U1}','u1@x.test','x','Mona Khalil',now()), ('${U2}','u2@x.test','x','Karim Adel',now());`;
  const history = rows
    .map(
      ([id, key, scope, oldV, newV, by, at]) =>
        `INSERT INTO "setting_changes" ("id","key","scope","old_value","new_value","changed_by_id","changed_at")
         VALUES ('${id}','${key}','${scope}',${literal(oldV)},${literal(newV)},${by ? `'${by}'` : 'NULL'},'${at}');`,
    )
    .join('\n');
  runSql(schema, `${users}\n${history}`);
}

function freshSchema(): string {
  const schema = `t27_copy_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  for (const m of before)
    runSql(schema, `CREATE SCHEMA IF NOT EXISTS "${schema}";\n${migrationSql(m)}`);
  return schema;
}

describe('settings history moves into the audit log (T27 migration, e2e)', () => {
  const schemas: string[] = [];
  const clients: DatabaseService[] = [];
  const open = (schema: string) => {
    const client = clientForSchema(schema);
    clients.push(client);
    return client;
  };

  afterAll(async () => {
    for (const c of clients) await c.$disconnect();
    for (const s of schemas) runSql('public', `DROP SCHEMA IF EXISTS "${s}" CASCADE;`);
  });

  it('edge case 11 — every old row is copied with the same count, values, people and times; then setting_changes is gone', async () => {
    const schema = freshSchema();
    schemas.push(schema);
    seedOldHistory(schema);
    runSql(schema, migrationSql(T27));

    const db = open(schema);
    const entries = await db.$queryRaw<Record<string, unknown>[]>`
      SELECT id::text, action, module, entity_type, entity_id, entity_label, actor_id::text,
             actor_name, changes, meta, to_char(at, 'YYYY-MM-DD HH24:MI:SS.MS') AS at
      FROM "audit_entries" ORDER BY seq`;
    expect(entries).toHaveLength(OLD_ROWS.length);

    const expectedAction: Record<string, string> = {
      '1': 'core.settings.update',
      '2': 'core.settings.logo_change',
      '3': 'core.settings.update',
      '4': 'hr.settings.update',
      '5': 'core.stage.create',
      '6': 'hr.department.create',
      '7': 'hr.department.update',
      '8': 'hr.job_title.create',
      '9': 'hr.penalty_group.create',
      a: 'hr.violation.update',
    };
    const names: Record<string, string> = { [U1]: 'Mona Khalil', [U2]: 'Karim Adel' };

    OLD_ROWS.forEach(([id, key, , oldV, newV, by, at], i) => {
      const e = entries[i];
      const parse = (v: string | null) => (v === null ? null : (JSON.parse(v) as unknown));
      expect(e).toMatchObject({
        id,
        action: expectedAction[id.slice(-1)],
        actor_id: by,
        actor_name: by ? names[by] : null,
        changes: [{ field: key, before: parse(oldV), after: parse(newV) }],
      });
      expect(e.module).toBe((e.action as string).split('.')[0]);
      // Same instant, to the millisecond.
      expect(e.at).toBe(at.includes('.') ? at : `${at}.000`);
    });

    // Records: the stage id comes from its key, list items from their snapshot, labels in English.
    expect(entries[4]).toMatchObject({
      entity_type: 'stage',
      entity_id: STAGE,
      entity_label: 'Primary',
    });
    expect(entries[6]).toMatchObject({
      entity_type: 'department',
      entity_id: DEPT,
      entity_label: 'Sciences',
    });
    expect(entries[9]).toMatchObject({
      entity_type: 'violation',
      entity_id: VIOL,
      entity_label: 'Late',
    });
    expect(entries[0]).toMatchObject({
      entity_type: 'school_settings',
      entity_id: 'school',
      entity_label: '',
    });

    const [gone] = await db.$queryRaw<{ t: string | null }[]>`
      SELECT to_regclass('setting_changes')::text AS t`;
    expect(gone.t).toBeNull();

    // The copied history is append-only like everything else.
    await expect(db.$executeRaw`DELETE FROM "audit_entries"`).rejects.toThrow(/append-only/);
  });

  it('an old row the migration cannot map stops it: nothing is copied and setting_changes stays', async () => {
    const schema = freshSchema();
    schemas.push(schema);
    seedOldHistory(schema, [
      ...OLD_ROWS.slice(0, 2),
      [
        'b0000000-0000-4000-8000-000000000001',
        'lists.unknown',
        'LISTS',
        'null',
        '{}',
        U1,
        '2026-10-09 09:00:00',
      ],
    ]);
    expect(() => runSql(schema, migrationSql(T27))).toThrow();

    // The migration runs as one script: a failure keeps nothing of it.
    const db = open(schema);
    const [kept] = await db.$queryRaw<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM "setting_changes"`;
    expect(kept.n).toBe(3);
    const [table] = await db.$queryRaw<{ t: string | null }[]>`
      SELECT to_regclass('audit_entries')::text AS t`;
    expect(table.t).toBeNull();
  });
});
