/**
 * T16 — the demo seed, run twice against the e2e database. One test per planned edge case
 * (plan → "### T16") plus the full flow. Uses the local client data when the git-ignored
 * `prisma/seed-data.local/` exists, else the generic fallback (CI).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ErrorCode, PayrollFlag, SEED_ADMIN_EMAIL } from '@school-erp/shared';
import { loadSeedData } from '../prisma/seed/data/load';
import { ADJUSTMENTS, DEMO_MONTH, LATENESS, PENALTIES } from '../prisma/seed/data/november';
import { EMPLOYEES } from '../prisma/seed/data/employees';
import { runSeed } from '../prisma/seed/run';
import { AppModule } from '../src/app.module';
import { SettingsService } from '../src/core/settings';
import { DatabaseService } from '../src/database/database.service';
import { PayrollService, PenaltyCatalogueService } from '../src/modules/hr';
import { countPriorInWindow, penaltyLevel } from '../src/modules/hr/domain';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const data = loadSeedData();

/** Empties every table the seed writes (this is an `_e2e` database — setup-env checks). */
async function wipe(db: DatabaseService): Promise<void> {
  await db.payrollRun.deleteMany({});
  await db.latenessEntry.deleteMany({});
  await db.penaltyRecord.deleteMany({});
  await db.violationLevel.deleteMany({});
  await db.violation.deleteMany({});
  await db.penaltyGroup.deleteMany({});
  await db.employee.updateMany({ data: { managerId: null } });
  await db.employee.deleteMany({});
  await db.department.deleteMany({});
  await db.jobTitle.deleteMany({});
  await db.stage.deleteMany({});
  await db.schoolSetting.deleteMany({});
  await db.user.deleteMany({ where: { email: SEED_ADMIN_EMAIL } });
}

/** Row counts of everything the seed creates, plus the employee codes and the code counter. */
async function snapshot(db: DatabaseService) {
  const [users, stages, departments, jobTitles, employees, groups, violations, levels] =
    await Promise.all([
      db.user.count({ where: { email: SEED_ADMIN_EMAIL } }),
      db.stage.count(),
      db.department.count(),
      db.jobTitle.count(),
      db.employee.count(),
      db.penaltyGroup.count(),
      db.violation.count(),
      db.violationLevel.count(),
    ]);
  const [penalties, lateness, runs, adjustments, codes, counter] = await Promise.all([
    db.penaltyRecord.count(),
    db.latenessEntry.count(),
    db.payrollRun.count(),
    db.payrollAdjustment.count(),
    db.employee.findMany({ select: { code: true }, orderBy: { code: 'asc' } }),
    db.counter.findUnique({ where: { name: 'employee_code' } }),
  ]);
  return {
    counts: {
      users,
      stages,
      departments,
      jobTitles,
      employees,
      groups,
      violations,
      levels,
      penalties,
      lateness,
      runs,
      adjustments,
    },
    codes: codes.map((c) => c.code),
    counter: counter?.value ?? 0,
  };
}

describe('Seed (e2e)', () => {
  let app: INestApplicationContext;
  let db: DatabaseService;
  let first: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    // SEED_ADMIN_PASSWORD comes from setup-env.ts (a throwaway e2e value).
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    db = app.get(DatabaseService);
    await wipe(db);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await runSeed({ app });
    first = await snapshot(db);
  }, 120_000);

  afterAll(async () => {
    // Let fire-and-forget history writes land, then leave the database empty for other suites.
    await new Promise((r) => setTimeout(r, 300));
    await wipe(db);
    await app.close();
  });

  it('Seed run twice → no duplicate employees or admin; codes not reused', async () => {
    await runSeed({ app });
    const second = await snapshot(db);

    expect(second).toEqual(first);
    expect(second.counts.users).toBe(1);
    expect(second.counts.employees).toBe(EMPLOYEES.length);
    // The counter never advanced on the second run: no code was handed out and thrown away.
    expect(second.counter).toBe(first.counter);
    expect(new Set(second.codes).size).toBe(second.codes.length);
  }, 120_000);

  it('Exactly one seeded employee (no. 1, a man) has the portrait photo; re-seeding keeps it', async () => {
    const withPhoto = await db.employee.findMany({
      where: { photoUrl: { not: null } },
      select: { nameEn: true, gender: true, photoUrl: true },
    });
    expect(withPhoto).toHaveLength(1);
    expect(withPhoto[0]).toMatchObject({ nameEn: EMPLOYEES[0].nameEn, gender: 'MALE' });
    expect(withPhoto[0].photoUrl).toMatch(/^\/files\/employee-photos\/.+\.jpg$/);
    await runSeed({ app });
    const again = await db.employee.findMany({ where: { photoUrl: { not: null } }, select: { photoUrl: true } });
    expect(again).toEqual([{ photoUrl: withPhoto[0].photoUrl }]);
  }, 120_000);

  it('Re-seeding after the catalogue data changed updates groups and violations by English name, creating nothing', async () => {
    const catalogue = app.get(PenaltyCatalogueService);
    const seedGroup = data.catalogue.groups[1];
    const seedViolation = seedGroup.violations[0];
    const group = await db.penaltyGroup.findFirstOrThrow({ where: { nameEn: seedGroup.nameEn } });
    const violation = await db.violation.findFirstOrThrow({
      where: { groupId: group.id, nameEn: seedViolation.nameEn },
    });
    // Stand-in for an older seed's wording and levels.
    await catalogue.updateGroup(group.id, { nameAr: 'اسم قديم للمجموعة' }, null);
    await catalogue.updateViolation(
      violation.id,
      {
        nameAr: 'اسم قديم',
        note: null,
        oncePerDay: !(seedViolation.oncePerDay ?? true),
        levels: [{ level: 1, action: 'NOTICE' }],
      },
      null,
    );

    await runSeed({ app });

    const after = await db.violation.findUniqueOrThrow({
      where: { id: violation.id },
      include: { levels: { orderBy: { level: 'asc' } }, group: true },
    });
    expect(after.group.nameAr).toBe(seedGroup.nameAr);
    expect(after.nameAr).toBe(seedViolation.nameAr);
    expect(after.note).toBe(seedViolation.note ?? null);
    expect(after.oncePerDay).toBe(seedViolation.oncePerDay ?? true);
    expect(after.levels.map((l) => [l.action, l.days === null ? null : Number(l.days)])).toEqual(
      seedViolation.levels.map((l) => [l.action, l.days ?? null]),
    );
    expect((await snapshot(db)).counts).toEqual(first.counts);
  }, 120_000);

  it('Seeded catalogue = 4 groups, 72 violations, each with 1–5 gap-free levels; DEDUCT_DAYS levels have days > 0', async () => {
    const groups = await db.penaltyGroup.findMany({
      include: { violations: { include: { levels: true } } },
    });
    const violations = groups.flatMap((g) => g.violations);

    expect(groups).toHaveLength(4);
    const expected = data.catalogue.groups.reduce((n, g) => n + g.violations.length, 0);
    expect(violations).toHaveLength(data.source === 'local' ? 72 : expected);
    for (const v of violations) {
      const numbers = v.levels.map((l) => l.level).sort((a, b) => a - b);
      expect(numbers.length).toBeGreaterThanOrEqual(1);
      expect(numbers.length).toBeLessThanOrEqual(5);
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
      for (const l of v.levels) {
        if (l.action === 'DEDUCT_DAYS') expect(Number(l.days)).toBeGreaterThan(0);
      }
    }
  });

  it('Seeded once-per-day flags (§4): on unless the data marks the violation as repeating in a day', async () => {
    const rows = await db.violation.findMany({
      select: { nameEn: true, oncePerDay: true, group: { select: { nameEn: true } } },
    });
    const flag = new Map(rows.map((r) => [`${r.group.nameEn}|${r.nameEn}`, r.oncePerDay]));
    for (const g of data.catalogue.groups) {
      for (const v of g.violations) {
        expect([v.nameEn, flag.get(`${g.nameEn}|${v.nameEn}`)]).toEqual([v.nameEn, v.oncePerDay ?? true]);
      }
    }
    // Late to class happens several times a day: every catalogue lets it repeat.
    const late = data.catalogue.groups.flatMap((g) => g.violations).find((v) => v.seedKey === 'late-to-class')!;
    expect(late.oncePerDay).toBe(false);
  });

  it('Seeded repeated penalties carry the levels penaltyLevel() gives over earlier approved ones', async () => {
    const window = (await app.get(SettingsService).getValues(['hr.penalties.repetitionWindow']))[
      'hr.penalties.repetitionWindow'
    ];
    const records = await db.penaltyRecord.findMany({
      include: { violation: { include: { levels: true } } },
    });
    const approved = records.filter((r) => r.status === 'APPROVED');
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    // Every record's place in the repeat order: date, then when recorded, then id (§4).
    const positions = records.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      violationId: r.violationId,
      status: r.status,
      date: iso(r.date),
      recordedAt: r.createdAt,
    }));

    for (const r of approved) {
      const target = positions.find((p) => p.id === r.id)!;
      const prior = countPriorInWindow(target, window, positions);
      expect(r.level).toBe(penaltyLevel(prior, r.violation.levels));
      const catalogueLevel = r.violation.levels.find((l) => l.level === r.level)!;
      expect(r.action).toBe(catalogueLevel.action);
    }
    // The demo really repeats: someone reached level 3, someone else level 2.
    expect(Math.max(...approved.map((r) => r.level))).toBe(3);
    expect(approved.filter((r) => r.level === 2).length).toBeGreaterThanOrEqual(2);
    // Same date, same violation, same employee: the one recorded first is level 1, the next 2.
    const sameDay = approved
      .filter((r) =>
        approved.some(
          (o) =>
            o.id !== r.id &&
            o.employeeId === r.employeeId &&
            o.violationId === r.violationId &&
            iso(o.date) === iso(r.date),
        ),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    expect(sameDay.map((r) => r.level)).toEqual([1, 2]);
  });

  it('The seeded November run recalculates with penalty, lateness and adjustment lines, and PENDING_PENALTIES where penalties are pending', async () => {
    const run = await db.payrollRun.findUniqueOrThrow({ where: { month: DEMO_MONTH } });
    expect(run.status).toBe('DRAFT');
    const payroll = app.get(PayrollService);

    const recalculated = await payroll.recalculate(run.id);
    const lines = recalculated.lines;
    const active = EMPLOYEES.filter((e) => !e.inactive).length;
    expect(lines).toHaveLength(active);
    expect(lines.some((l) => l.penaltyAmount > 0 && l.penaltyDays > 0)).toBe(true);
    expect(lines.some((l) => l.latenessAmount > 0 && l.latenessDays > 0)).toBe(true);
    expect(lines.some((l) => l.adjustmentAdditions > 0)).toBe(true);
    expect(lines.some((l) => l.adjustmentDeductions > 0)).toBe(true);
    expect(recalculated.adjustments).toHaveLength(ADJUSTMENTS.length);

    const pendingIds = new Set(
      (await db.penaltyRecord.findMany({ where: { status: 'PENDING' } })).map((p) => p.employeeId),
    );
    expect(pendingIds.size).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.flags.includes(PayrollFlag.PENDING_PENALTIES)).toBe(pendingIds.has(l.employeeId));
    }
    await expect(payroll.approve(run.id, null)).rejects.toMatchObject({
      code: ErrorCode.PENDING_PENALTIES,
    });
  });

  it('No credentials or client catalogue text in tracked files', () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
    const tracked = git('ls-files').split('\n').filter(Boolean);

    expect(tracked.filter((p) => p.includes('seed-data.local/'))).toEqual([]);
    expect(tracked.filter((p) => /(^|\/)\.env$|\.local\.md$|CREDENTIALS/.test(p))).toEqual([]);
    // Throws (non-zero exit) if the folder were not ignored.
    git('check-ignore', '-q', 'apps/api/prisma/seed-data.local/catalogue.json');

    if (data.source !== 'local') return;
    // The school's names, the regulations' Arabic wording, and the English renderings long enough
    // to be distinctive (a short generic phrase like "Using a phone in class" is fair game for a
    // test fixture elsewhere).
    const violations = data.catalogue.groups.flatMap((g) => g.violations);
    const needles = [
      data.school.nameEn,
      data.school.nameAr,
      ...violations.map((v) => v.nameAr).filter((s) => s.length >= 12),
      ...violations.map((v) => v.nameEn).filter((s) => s.length >= 30),
    ];
    const text = tracked.filter((p) => /\.(ts|tsx|js|mjs|cjs|json|md|css|html|ya?ml|txt)$/.test(p));
    for (const path of text) {
      if (path === 'pnpm-lock.yaml') continue;
      const content = readFileSync(join(REPO_ROOT, path), 'utf8');
      const leaked = needles.filter((n) => content.includes(n));
      expect({ path, leaked }).toEqual({ path, leaked: [] });
    }
  });

  it('full flow: admin, identity, lists, staff, November lateness, penalties and the DRAFT run', async () => {
    const school = await app.get(SettingsService).getSchoolSettings();
    expect(school.nameEn).toBe(data.school.nameEn);
    expect(school.nameAr).toBe(data.school.nameAr);
    if (data.logoPath) expect(school.logoUrl).toMatch(/^\/files\/logo\/logo-.+\.png$/);

    expect(await db.stage.count()).toBe(4);
    expect(await db.department.count()).toBeGreaterThanOrEqual(10);
    expect(await db.jobTitle.count()).toBeGreaterThanOrEqual(15);
    expect(await db.employee.count({ where: { status: 'INACTIVE' } })).toBe(2);
    expect(await db.employee.count({ where: { managerId: { not: null } } })).toBeGreaterThan(5);
    // §3: the leading titles manage people, and every seeded manager holds one.
    expect(await db.jobTitle.count({ where: { managesPeople: true } })).toBeGreaterThanOrEqual(3);
    expect(
      await db.employee.count({
        where: { managerId: { not: null }, manager: { jobTitle: { managesPeople: false } } },
      }),
    ).toBe(0);
    const workSystems = await db.employee.groupBy({ by: ['workSystem'], _count: true });
    expect(workSystems).toHaveLength(4);
    const salaries = await db.employee.aggregate({
      _min: { basicSalary: true },
      _max: { basicSalary: true },
    });
    expect(salaries._min.basicSalary).toBeGreaterThanOrEqual(500_000);
    expect(salaries._max.basicSalary).toBeLessThanOrEqual(2_000_000);

    expect(await db.latenessEntry.count({ where: { month: DEMO_MONTH } })).toBe(LATENESS.length);
    const byStatus = await db.penaltyRecord.groupBy({ by: ['status'], _count: true });
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
    expect(count('PENDING')).toBe(2);
    expect(count('CANCELLED')).toBe(1);
    expect(count('APPROVED')).toBe(PENALTIES.length - 3);
    expect(await db.payrollAdjustment.count()).toBe(ADJUSTMENTS.length);
  });
});
