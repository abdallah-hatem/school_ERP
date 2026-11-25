import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { SEARCH_FIXTURE } from '@school-erp/shared/testing';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { deleteEmployees } from './helpers/employees';
import { ACTION_ID } from './helpers/penalty-actions';

/*
 * The database searches find Arabic letter variants, joined / split names, any word order, partial
 * words and accents, with `%` / `_` literal (docs/ARCHITECTURE.md → Search) — the shared fixture
 * through the employees list, the employee picker, users, roles, the activity log (records and
 * people) and penalties. Each case stores one name and types one query; the row must (or must not)
 * be on the page. Other suites' rows may match too, so each check looks only for its own row.
 */

type Case = readonly [stored: string, query: string];
const matches: readonly Case[] = SEARCH_FIXTURE.matches;
const misses: readonly Case[] = SEARCH_FIXTURE.misses;
const all = [...matches, ...misses];
const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

describe('Arabic-aware database search (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let stageId: string;
  let groupId: string;
  let violationId: string;
  /** Per case (index into `all`): the rows made for it. */
  const employees: string[] = [];
  const users: string[] = [];
  const roles: string[] = [];
  const entries: string[] = [];
  const penalties: string[] = [];

  type Row = Record<string, string>;
  /** The ids on the first page (100) of `path` searched by `query`. */
  const idsOf = async (path: string, param: string, query: string, pick = (r: Row) => r.id) =>
    ((await http(app).get(path).query({ [param]: query, limit: 100 }).expect(200)).body.data as Row[]).map(pick);

  beforeAll(async () => {
    ({ app } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    stageId = (await db.stage.create({ data: { nameEn: unique('Search stage'), nameAr: 'مرحلة البحث' } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('Search'), nameAr: 'بحث' }).expect(201)).body.data.id as string;
    const departmentId = await mk('/hr/departments');
    const jobTitleId = await mk('/hr/job-titles');
    // Through the API, so the violation has its levels (the penalties list works out each record's
    // shown level from them).
    groupId = (
      await http(app)
        .post('/hr/penalty-groups')
        .send({ nameEn: unique('Search group'), nameAr: 'مجموعة' })
        .expect(201)
    ).body.data.id as string;
    violationId = (
      await http(app)
        .post(`/hr/penalty-groups/${groupId}/violations`)
        .send({ nameEn: 'Qv lateness', nameAr: 'التأخير الصباحي', levels: [{ level: 1, actionId: ACTION_ID.NOTICE }] })
        .expect(201)
    ).body.data.id as string;

    for (const [i, [stored]] of all.entries()) {
      const other = `Qx${i}`;
      const emp = await http(app)
        .post('/hr/employees')
        .send({
          nameEn: isArabic(stored) ? other : stored,
          nameAr: isArabic(stored) ? stored : other,
          gender: 'FEMALE',
          dateOfBirth: '1990-04-12',
          phone: '01000000000',
          hireDate: '2024-09-01',
          stageId,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1400000,
        })
        .expect(201);
      employees.push(emp.body.data.id);

      const email = `${unique('qs')}@example.test`.toLowerCase();
      users.push((await db.user.create({ data: { email, name: stored, passwordHash: 'not-a-hash' } })).id);
      roles.push((await db.role.create({ data: { key: unique('search-role'), nameEn: stored, nameAr: stored } })).id);

      const entityId = randomUUID();
      await db.auditEntry.create({
        data: {
          action: 'core.user.update',
          module: 'core',
          entityType: 'user',
          entityId,
          entityLabel: isArabic(stored) ? other : stored,
          entityLabelAr: isArabic(stored) ? stored : null,
          actorId: users[i],
          actorName: stored,
        },
      });
      entries.push(entityId);

      penalties.push(
        (
          await db.penaltyRecord.create({
            data: {
              employeeId: employees[i],
              violationId,
              stageId,
              date: new Date('2025-10-05'),
              level: 1,
              actionId: ACTION_ID.NOTICE,
              actionNameEn: 'Notice',
              actionNameAr: 'لفت نظر',
              effect: 'RECORD_ONLY',
            },
          })
        ).id,
      );
    }
  });

  afterAll(async () => {
    await db.penaltyRecord.deleteMany({ where: { id: { in: penalties } } });
    await db.violationLevel.deleteMany({ where: { violationId } });
    await db.violation.deleteMany({ where: { id: violationId } });
    await db.penaltyGroup.deleteMany({ where: { id: groupId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.role.deleteMany({ where: { id: { in: roles } } });
    await deleteEmployees(db, { where: { id: { in: employees } } });
    await app.close();
  });

  /** Each search: where it lives, its query parameter, and the id of case `i`'s row on its page. */
  const searches: { name: string; path: string; param: string; row: (i: number) => string; pick?: (r: Row) => string }[] = [
    { name: 'employees list', path: '/hr/employees', param: 'search', row: (i) => employees[i] },
    { name: 'employee picker (user form)', path: '/users/employee-options', param: 'search', row: (i) => employees[i] },
    { name: 'users', path: '/users', param: 'search', row: (i) => users[i] },
    { name: 'roles', path: '/roles', param: 'search', row: (i) => roles[i] },
    {
      name: 'activity log (record names)',
      path: '/audit',
      param: 'q',
      row: (i) => entries[i],
      pick: (r) => r.entityId,
    },
    { name: 'activity log people', path: '/audit/actors', param: 'search', row: (i) => users[i] },
    { name: 'penalties (employee name)', path: '/hr/penalties', param: 'search', row: (i) => penalties[i] },
  ];

  describe.each(searches)('$name', ({ path, param, row, pick }) => {
    it.each(matches.map(([stored, query], i) => [stored, query, i] as const))(
      '%j is found by %j',
      async (_stored, query, i) => {
        expect(await idsOf(path, param, query, pick)).toContain(row(i));
      },
    );

    it.each(misses.map(([stored, query], i) => [stored, query, matches.length + i] as const))(
      '%j is not found by %j',
      async (_stored, query, i) => {
        expect(await idsOf(path, param, query, pick)).not.toContain(row(i));
      },
    );
  });

  it('penalties are also found by the violation name, any letter variant', async () => {
    const found = await idsOf('/hr/penalties', 'search', 'التاخير الصباحى');
    expect(found).toEqual(expect.arrayContaining(penalties));
  });

  it('paging, totals and order stay on the server: the total counts every match, a page holds `limit`', async () => {
    const res = await http(app).get('/hr/employees').query({ search: 'احمد', limit: 1, page: 1 }).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    const page2 = await http(app).get('/hr/employees').query({ search: 'احمد', limit: 1, page: 2 }).expect(200);
    expect(page2.body.data[0].id).not.toBe(res.body.data[0].id);
  });

  it('a blank or zero-width-only search is no search', async () => {
    const plain = await http(app).get('/roles').query({ limit: 1 }).expect(200);
    const blank = await http(app).get('/roles').query({ search: ' \u200B\u00A0 ', limit: 1 }).expect(200);
    expect(blank.body.meta.total).toBe(plain.body.meta.total);
  });
});
