import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SEED_ADMIN_EMAIL, type Month } from '@school-erp/shared';
import { normalizeEmail } from '../../src/common/utils/password.util';
import { SettingsService } from '../../src/core/settings';
import { StagesService } from '../../src/core/school-structure';
import { DatabaseService } from '../../src/database/database.service';
import {
  DepartmentsService,
  EmployeesService,
  JobTitlesService,
  LatenessService,
  MonthLockService,
  PayrollService,
  PenaltyCatalogueService,
  PenaltyRecordsService,
} from '../../src/modules/hr';
import { seedAdmin } from './admin';
import { EMPLOYEES, generatedFields } from './data/employees';
import { levelsOf, loadSeedData } from './data/load';
import { DEPARTMENTS, JOB_TITLES, STAGES, type SeedListItem } from './data/lists';
import { ADJUSTMENTS, DEMO_MONTH, LATENESS, PENALTIES } from './data/november';
import type { SeedCatalogue, SeedData } from './data/types';

/** Every contract runs 1 June – 31 May (§3); the demo employees are on the 2026/27 contract. */
const CONTRACT = { start: '2026-06-01', end: '2027-05-31' } as const;

const LOGO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export interface SeedSummary {
  source: SeedData['source'];
  employees: number;
  violations: number;
  penalties: number;
  month: Month;
  monthSeeded: boolean;
}

const log = (msg: string) => console.log(`seed: ${msg}`);

/**
 * The full demo seed (T16), idempotent: everything is matched by a natural key (names, national
 * ID, violation + employee + date, the run's month) and only what is missing is created, so a
 * second run creates nothing and uses no new employee codes. Every write goes through the owning
 * module's service (history rows, events and computed penalty levels included); the database
 * client is used only for the admin account (T2's `seedAdmin`) and for read-only lookups.
 *
 * Pass `app` to reuse a running application context (tests); otherwise one is created and closed.
 */
export async function runSeed(
  options: { app?: INestApplicationContext } = {},
): Promise<SeedSummary> {
  // The seed signs no tokens, but the app's env validation requires a secret to boot.
  process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString('base64');
  const app = options.app ?? (await createContext());
  try {
    return await seedAll(app);
  } finally {
    if (!options.app) {
      // List and catalogue services emit `settings.changed` without awaiting; let the history
      // listener finish before the database connection closes.
      await new Promise((r) => setTimeout(r, 500));
      await app.close();
    }
  }
}

async function createContext(): Promise<INestApplicationContext> {
  // Imported late: the config module validates the environment when the app module loads.
  const { AppModule } = await import('../../src/app.module');
  return NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
}

async function seedAll(app: INestApplicationContext): Promise<SeedSummary> {
  const get = <T>(token: new (...args: never[]) => T): T => app.get(token, { strict: false });
  const db = get(DatabaseService);
  const data = loadSeedData();
  log(`using ${data.source === 'local' ? 'seed-data.local/' : 'the generic fallback'} data`);

  await seedAdmin(db);
  const admin = await db.user.findUniqueOrThrow({
    where: { email: normalizeEmail(SEED_ADMIN_EMAIL) },
    select: { id: true },
  });

  await seedSchool(get(SettingsService), data, admin.id);

  const stages = await ensureList(STAGES, db.stage.findMany({ select: listSelect }), (item) =>
    get(StagesService).create({ nameEn: item.nameEn, nameAr: item.nameAr }, admin.id),
  );
  const departments = await ensureList(
    DEPARTMENTS,
    db.department.findMany({ select: listSelect }),
    (item) =>
      get(DepartmentsService).create({ nameEn: item.nameEn, nameAr: item.nameAr }, admin.id),
  );
  const jobTitles = await ensureList(
    JOB_TITLES,
    db.jobTitle.findMany({ select: listSelect }),
    (item) =>
      get(JobTitlesService).create(
        { nameEn: item.nameEn, nameAr: item.nameAr, managesPeople: item.managesPeople ?? false },
        admin.id,
      ),
  );
  await ensureManagingTitles(get(JobTitlesService), jobTitles, admin.id);
  log(
    `lists ready (${stages.size} stages, ${departments.size} departments, ${jobTitles.size} job titles)`,
  );

  const employees = get(EmployeesService);
  const employeeIds = new Map<number, string>();
  let created = 0;
  for (const e of EMPLOYEES) {
    const fields = generatedFields(e);
    const existing = await db.employee.findUnique({
      where: { nationalId: fields.nationalId },
      select: { id: true },
    });
    let id = existing?.id;
    if (!id) {
      const managerId = e.manager ? employeeIds.get(e.manager) : undefined;
      id = (
        await employees.create({
          nameEn: e.nameEn,
          nameAr: e.nameAr,
          nationalId: fields.nationalId,
          gender: e.gender,
          dateOfBirth: fields.dateOfBirth,
          phone: fields.phone,
          email: null,
          address: null,
          hireDate: fields.hireDate,
          stageId: stages.get(e.stage)!,
          departmentId: departments.get(e.department)!,
          jobTitleId: jobTitles.get(e.jobTitle)!,
          managerId: managerId ?? null,
          grade: null,
          workSystem: e.workSystem,
          basicSalary: fields.basicSalary,
          fingerprintId: fields.fingerprintId,
          contractStart: CONTRACT.start,
          contractEnd: CONTRACT.end,
          usesBus: e.n % 4 === 0,
        })
      ).id;
      created += 1;
    }
    employeeIds.set(e.n, id);
    if (e.inactive) await employees.deactivate(id);
  }
  log(`employees ready (${EMPLOYEES.length}, ${created} new)`);

  const violationIds = await seedCatalogue(
    get(PenaltyCatalogueService),
    db,
    data.catalogue,
    admin.id,
  );
  const violationCount = data.catalogue.groups.reduce((n, g) => n + g.violations.length, 0);
  log(
    `penalty catalogue ready (${data.catalogue.groups.length} groups, ${violationCount} violations)`,
  );

  const monthSeeded = await seedMonth(app, db, admin.id, employeeIds, violationIds);

  return {
    source: data.source,
    employees: EMPLOYEES.length,
    violations: violationCount,
    penalties: PENALTIES.length,
    month: DEMO_MONTH,
    monthSeeded,
  };
}

/** School identity (§7 "from the seed"). Every other setting keeps its §7 default (no row). */
async function seedSchool(settings: SettingsService, data: SeedData, adminId: string) {
  await settings.setValues(
    'school',
    { 'school.nameEn': data.school.nameEn, 'school.nameAr': data.school.nameAr },
    adminId,
  );
  const { logoUrl } = await settings.getSchoolSettings();
  if (data.logoPath && !logoUrl) {
    const buffer = readFileSync(data.logoPath);
    const mimetype = LOGO_MIME[extname(data.logoPath).toLowerCase()] ?? 'application/octet-stream';
    // Through the same validation and file storage as an upload, so `/files/logo/…` serves it.
    await settings.setLogo({ mimetype, size: buffer.length, buffer }, adminId);
    log('school logo stored');
  }
  log(`school identity set (${data.source})`);
}

const listSelect = { id: true, nameEn: true } as const;

/**
 * The seed's managing titles (§3) manage people even in a database seeded before the switch
 * existed — otherwise its direct-manager picker would be empty. Only turns the switch on, through
 * the service (so the change history records it); a title the seed doesn't mark is left alone.
 */
async function ensureManagingTitles(
  service: JobTitlesService,
  ids: Map<string, string>,
  adminId: string,
): Promise<void> {
  const current = new Map((await service.list(true)).map((t) => [t.id, t.managesPeople]));
  for (const item of JOB_TITLES) {
    const id = ids.get(item.key);
    if (!('managesPeople' in item) || !item.managesPeople || !id || current.get(id)) continue;
    await service.update(id, { managesPeople: true }, adminId);
  }
}

/** Creates the items whose English name is missing; returns seed key → id. */
async function ensureList(
  items: readonly SeedListItem[],
  existingQuery: Promise<{ id: string; nameEn: string }[]>,
  create: (item: SeedListItem) => Promise<{ id: string }>,
): Promise<Map<string, string>> {
  const existing = new Map((await existingQuery).map((row) => [row.nameEn, row.id]));
  const ids = new Map<string, string>();
  for (const item of items) {
    const id = existing.get(item.nameEn) ?? (await create(item)).id;
    ids.set(item.key, id);
  }
  return ids;
}

/** Stored levels in the shape `levelsOf` produces, for comparing with the seed data. */
const storedLevels = (levels: { level: number; action: string; days: unknown }[]) =>
  [...levels]
    .sort((a, b) => a.level - b.level)
    .map((l) => ({
      level: l.level,
      action: l.action,
      days: l.days === null ? null : Number(l.days),
    }));

/**
 * Groups by English name, violations by group + English name; returns seedKey → id. A missing
 * one is created; an existing one whose Arabic name, note or levels differ from the seed data is
 * updated through the catalogue service (history row included — approved penalties keep their
 * fixed level, §4). Nothing is retired.
 */
async function seedCatalogue(
  catalogue: PenaltyCatalogueService,
  db: DatabaseService,
  data: SeedCatalogue,
  adminId: string,
): Promise<Map<string, string>> {
  const bySeedKey = new Map<string, string>();
  for (const [index, group] of data.groups.entries()) {
    const existingGroup = await db.penaltyGroup.findFirst({
      where: { nameEn: group.nameEn },
      select: { id: true, nameAr: true },
    });
    let groupId = existingGroup?.id;
    if (!groupId) {
      groupId = (
        await catalogue.createGroup(
          { nameEn: group.nameEn, nameAr: group.nameAr, sortOrder: index },
          adminId,
        )
      ).id;
    } else if (existingGroup!.nameAr !== group.nameAr) {
      await catalogue.updateGroup(groupId, { nameAr: group.nameAr }, adminId);
    }

    for (const v of group.violations) {
      const wanted = { nameAr: v.nameAr, note: v.note ?? null, levels: levelsOf(v.levels) };
      const existing = await db.violation.findFirst({
        where: { groupId, nameEn: v.nameEn },
        select: { id: true, nameAr: true, note: true, levels: true },
      });
      let violationId = existing?.id;
      if (!existing) {
        violationId = (
          await catalogue.createViolation(groupId, { nameEn: v.nameEn, ...wanted }, adminId)
        ).id;
      } else if (
        existing.nameAr !== wanted.nameAr ||
        existing.note !== wanted.note ||
        JSON.stringify(storedLevels(existing.levels)) !== JSON.stringify(wanted.levels)
      ) {
        await catalogue.updateViolation(existing.id, wanted, adminId);
      }
      if (v.seedKey) bySeedKey.set(v.seedKey, violationId!);
    }
  }
  return bySeedKey;
}

/**
 * November: lateness, penalties (approved / cancelled through the service, in date order so
 * repeat levels are computed), then the DRAFT run with its adjustments. Skipped whole once the
 * month's payroll is approved — an approved month never changes.
 */
async function seedMonth(
  app: INestApplicationContext,
  db: DatabaseService,
  adminId: string,
  employeeIds: Map<number, string>,
  violationIds: Map<string, string>,
): Promise<boolean> {
  const get = <T>(token: new (...args: never[]) => T): T => app.get(token, { strict: false });
  if (await get(MonthLockService).isMonthLocked(DEMO_MONTH)) {
    log(`${DEMO_MONTH} payroll is approved — month data left as it is`);
    return false;
  }
  const emp = (n: number) => employeeIds.get(n)!;

  await get(LatenessService).put(
    DEMO_MONTH,
    { entries: LATENESS.map(([n, minutes]) => ({ employeeId: emp(n), minutes })) },
    adminId,
  );

  const penalties = get(PenaltyRecordsService);
  // The nth seed entry of an employee + violation + date matches the nth such record (in the order
  // recorded), so same-day repeats are recorded once each and keep their order on re-runs.
  const seen = new Map<string, number>();
  for (const p of [...PENALTIES].sort((a, b) => a.date.localeCompare(b.date))) {
    const employeeId = emp(p.employee);
    const violationId = violationIds.get(p.violation)!;
    const sameDayKey = `${p.employee}:${p.violation}:${p.date}`;
    const nth = seen.get(sameDayKey) ?? 0;
    seen.set(sameDayKey, nth + 1);
    const existing = await db.penaltyRecord.findFirst({
      where: { employeeId, violationId, date: new Date(`${p.date}T00:00:00Z`) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: nth,
      select: { id: true, status: true },
    });
    const record =
      existing ??
      (await penalties.create(
        { employeeId, violationId, date: p.date, note: p.note ?? null },
        adminId,
      ));
    if (p.status === 'APPROVED' && record.status === 'PENDING') {
      await penalties.approve(record.id, adminId);
    } else if (p.status === 'CANCELLED' && record.status !== 'CANCELLED') {
      await penalties.cancel(record.id, { reason: p.cancelReason ?? 'أُلغيت' }, adminId);
    }
  }

  const payroll = get(PayrollService);
  const run = await db.payrollRun.findUnique({
    where: { month: DEMO_MONTH },
    select: { id: true },
  });
  if (!run) {
    const { id } = await payroll.create(DEMO_MONTH, adminId);
    for (const a of ADJUSTMENTS) {
      await payroll.addAdjustment(
        id,
        { employeeId: emp(a.employee), type: a.type, amount: a.amount, reason: a.reason },
        adminId,
      );
    }
    log(`${DEMO_MONTH} DRAFT payroll run created with ${ADJUSTMENTS.length} adjustments`);
  } else {
    await payroll.recalculate(run.id);
    log(`${DEMO_MONTH} DRAFT payroll run recalculated`);
  }
  return true;
}
