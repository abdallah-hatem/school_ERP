import {
  ConflictException,
  Controller,
  INestApplication,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuditEntry, AuthUser } from '@school-erp/shared';
import { Audited, AuditService, NotAudited } from '../src/core/audit';
import { SignedIn } from '../src/core/permissions';
import { SettingsService } from '../src/core/settings';
import { CoreModule } from '../src/core';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';
import { historyMark } from './helpers/history';

/**
 * Test-only endpoints exercising the audit rules against the real database and transactions:
 * the `@Audited` run-time check (D6b), rollback (edge cases 1 and 2), and `record()` outside a
 * transaction (D2). Not part of the app; the controller scans only cover src/.
 */
@Controller('__audit-probe')
@SignedIn()
class AuditProbeController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Changes the school name and forgets to record `core.stage.create` → 500, rolled back. */
  @Patch('forgets')
  @Audited('core.stage.create')
  forgets(@Query('name') name: string) {
    return this.settings.setValues('school', { 'school.nameEn': name }, null);
  }

  /** Changes and records, then fails → its own 409, nothing kept. */
  @Patch('throws')
  @Audited('core.settings.update')
  async throws(@Query('name') name: string) {
    await this.settings.setValues('school', { 'school.nameEn': name }, null);
    throw new ConflictException('probe');
  }

  @Post('outside')
  @NotAudited('test probe')
  outside() {
    return this.audit.record({
      action: 'core.auth.sign_out',
      entity: { type: 'user', id: 'x', label: 'x' },
    });
  }

  /** Two actions in one request, on the same record. */
  @Post('two/:id')
  @Audited('hr.employee.update')
  async two(@Param('id') id: string, @Query('label') label: string) {
    const entity = { type: 'employee' as const, id, label };
    await this.audit.record({ action: 'hr.employee.create', entity, after: { nameEn: label } });
    await this.audit.record({
      action: 'hr.employee.update',
      entity,
      before: { phone: '010', basicSalary: 1400000 },
      after: { phone: '011', basicSalary: 1500000 },
    });
  }

  /** A record with an English and an Arabic name (UI audit finding 3). */
  @Post('named/:id')
  @Audited('hr.violation.update')
  named(@Param('id') id: string, @Query('en') en: string, @Query('ar') ar: string) {
    return this.audit.record({
      action: 'hr.violation.update',
      entity: { type: 'violation', id, label: { en, ar } },
      changes: [{ field: 'nameAr', before: 'قديم', after: ar }],
    });
  }

  /** Recorded on behalf of a given user (as a successful sign-in will be). */
  @Post('as/:userId')
  @Audited('core.auth.sign_in')
  as(@Param('userId') userId: string, @Query('label') label: string) {
    return this.audit.record({
      action: 'core.auth.sign_in',
      entity: { type: 'user', id: userId, label },
      actor: { id: userId },
    });
  }
}

@Module({ imports: [CoreModule], controllers: [AuditProbeController] })
class AuditProbeModule {}

describe('audit log (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  const tempUserIds: string[] = [];

  const entriesAfter = (mark: bigint) =>
    db.auditEntry.findMany({ where: { seq: { gt: mark } }, orderBy: { seq: 'asc' } });
  const schoolName = async () =>
    (await db.schoolSetting.findUnique({ where: { key: 'school.nameEn' } }))?.value ?? null;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser(undefined, [AuditProbeModule]));
    db = app.get(DatabaseService);
    await db.schoolSetting.deleteMany({ where: { key: { startsWith: 'school.' } } });
  });

  afterAll(async () => {
    await db.schoolSetting.deleteMany({ where: { key: { startsWith: 'school.' } } });
    await db.user.updateMany({ where: { id: user.id }, data: { name: user.name } });
    await db.user.deleteMany({ where: { id: { in: tempUserIds } } });
    await app.close();
  });

  describe('writes', () => {
    it('a settings change is one entry in the AuditEntry shape: who, IP, device, changed fields only', async () => {
      const mark = await historyMark(db);
      const name = unique('School');
      await http(app)
        .patch('/settings/school')
        .set('User-Agent', 'e2e-agent/1.0')
        .send({ nameEn: name, defaultLanguage: 'en' /* unchanged */ })
        .expect(200);

      const res = await http(app).get('/audit?action=core.settings.update&limit=1').expect(200);
      const entry = res.body.data[0] as AuditEntry;
      expect(Object.keys(entry).sort()).toEqual(
        [
          'action',
          'actor',
          'at',
          'changes',
          'entityId',
          'entityLabel',
          'entityType',
          'id',
          'meta',
          'module',
        ].sort(),
      );
      expect(entry).toMatchObject({
        action: 'core.settings.update',
        module: 'core',
        entityType: 'school_settings',
        entityId: 'school',
        actor: { id: user.id, name: user.name },
        changes: [{ field: 'school.nameEn', before: '', after: name }],
        meta: { userAgent: 'e2e-agent/1.0' },
      });
      expect(typeof entry.meta.ip).toBe('string');
      expect(Number.isNaN(Date.parse(entry.at))).toBe(false);

      const rows = await entriesAfter(mark);
      expect(rows).toHaveLength(1);
      // The request id is kept in the table (not in the API).
      expect((rows[0].meta as { requestId?: string }).requestId).toEqual(expect.any(String));
    });

    it('edge case 3 — saving with nothing changed records nothing', async () => {
      const current = await http(app).get('/settings/school').expect(200);
      const mark = await historyMark(db);
      await http(app)
        .patch('/settings/school')
        .send({ nameEn: current.body.data.nameEn })
        .expect(200);
      await http(app).patch('/settings/school').send({}).expect(200);
      expect(await entriesAfter(mark)).toHaveLength(0);
    });

    it('edge case 1 — a change that fails (validation, rule) records nothing', async () => {
      const mark = await historyMark(db);
      await http(app)
        .patch('/settings/school')
        .send({ workStart: '09:00', workEnd: '08:00' })
        .expect(400);
      await http(app).patch('/settings/school').send({ workStart: '7:30' }).expect(400);
      expect(await entriesAfter(mark)).toHaveLength(0);
    });

    it('D6b — an @Audited handler that succeeds without recording its action → 500 AUDIT_NOT_RECORDED, the change rolls back', async () => {
      const before = await schoolName();
      const mark = await historyMark(db);
      const res = await http(app)
        .patch(`/__audit-probe/forgets?name=${unique('Lost')}`)
        .expect(500);
      expect(res.body).toMatchObject({ success: false, error: 'AUDIT_NOT_RECORDED' });
      expect(await schoolName()).toEqual(before);
      expect(await entriesAfter(mark)).toHaveLength(0);
    });

    it('an @Audited handler that throws keeps its own error; the change and its entry roll back', async () => {
      const before = await schoolName();
      const mark = await historyMark(db);
      const res = await http(app)
        .patch(`/__audit-probe/throws?name=${unique('Gone')}`)
        .expect(409);
      expect(res.body.error).not.toBe('AUDIT_NOT_RECORDED');
      expect(await schoolName()).toEqual(before);
      expect(await entriesAfter(mark)).toHaveLength(0);
    });

    it('D2 — record() outside a transaction fails and writes nothing', async () => {
      const mark = await historyMark(db);
      await http(app).post('/__audit-probe/outside').expect(500);
      expect(await entriesAfter(mark)).toHaveLength(0);
    });

    it('two writes in one request record two entries, in order; the record history is newest first', async () => {
      const id = `probe-${Date.now()}`;
      const label = unique('Probe Employee');
      await http(app)
        .post(`/__audit-probe/two/${id}?label=${encodeURIComponent(label)}`)
        .expect(201);

      const res = await http(app).get(`/audit/records/employee/${id}`).expect(200);
      expect(res.body.data.map((e: AuditEntry) => e.action)).toEqual([
        'hr.employee.update',
        'hr.employee.create',
      ]);
      // Only the changed fields, money in piastres.
      expect(res.body.data[0].changes).toEqual([
        { field: 'phone', before: '010', after: '011' },
        { field: 'basicSalary', before: 1400000, after: 1500000 },
      ]);
      expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
    });

    it('edge case 4 — renaming or deleting a user later keeps the name the entries were written with', async () => {
      const temp = await db.user.create({
        data: {
          email: `${unique('temp')}@example.test`,
          name: 'Old Name',
          passwordHash: 'not-a-real-hash',
        },
        select: { id: true },
      });
      tempUserIds.push(temp.id);
      const label = unique('signin');
      await http(app).post(`/__audit-probe/as/${temp.id}?label=${label}`).expect(201);
      await db.user.update({ where: { id: temp.id }, data: { name: 'New Name' } });
      await db.user.delete({ where: { id: temp.id } });

      const res = await http(app).get(`/audit?actorId=${temp.id}`).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        entityLabel: { en: label, ar: label },
        actor: { id: temp.id, name: 'Old Name' },
      });

      // The signed-in user renamed: their old entries keep the old name.
      await db.user.update({ where: { id: user.id }, data: { name: 'Renamed Admin' } });
      const mine = await http(app).get(`/audit?actorId=${user.id}&limit=1`).expect(200);
      expect(mine.body.data[0].actor).toEqual({ id: user.id, name: user.name, employeeId: null });
      await db.user.update({ where: { id: user.id }, data: { name: user.name } });
    });

    it('edge case 8 — the database refuses UPDATE, DELETE and TRUNCATE on audit_entries', async () => {
      const row = await db.auditEntry.findFirst({ select: { id: true } });
      expect(row).not.toBeNull();
      const id = row!.id;
      await expect(
        db.$executeRaw`UPDATE "audit_entries" SET "action" = 'x' WHERE "id" = ${id}::uuid`,
      ).rejects.toThrow(/append-only/);
      await expect(
        db.$executeRaw`DELETE FROM "audit_entries" WHERE "id" = ${id}::uuid`,
      ).rejects.toThrow(/append-only/);
      await expect(db.$executeRaw`TRUNCATE "audit_entries"`).rejects.toThrow(/append-only/);
      await expect(db.auditEntry.deleteMany({ where: { id } })).rejects.toThrow();
      expect(await db.auditEntry.count({ where: { id } })).toBe(1);
    });
  });

  describe('GET /audit', () => {
    it('filters by module, action, person, record label and time; newest first; server-paged', async () => {
      const label = unique('Filter Probe');
      const id = `filter-${Date.now()}`;
      const from = new Date(Date.now() - 1000).toISOString();
      await http(app)
        .post(`/__audit-probe/two/${id}?label=${encodeURIComponent(label)}`)
        .expect(201);
      const to = new Date(Date.now() + 1000).toISOString();

      const q = encodeURIComponent(label.toUpperCase()); // case-insensitive search
      const all = await http(app).get(`/audit?q=${q}`).expect(200);
      expect(all.body.data.map((e: AuditEntry) => e.action)).toEqual([
        'hr.employee.update',
        'hr.employee.create',
      ]);
      expect(all.body.meta).toMatchObject({ total: 2, page: 1, limit: 10 });

      const byAction = await http(app).get(`/audit?q=${q}&action=hr.employee.create`).expect(200);
      expect(byAction.body.data).toHaveLength(1);
      // Several actions (any of them): comma-separated or repeated.
      expect(
        (await http(app).get(`/audit?q=${q}&action=hr.employee.create,hr.employee.update`).expect(200))
          .body.meta.total,
      ).toBe(2);
      expect(
        (
          await http(app)
            .get(`/audit?q=${q}&action=hr.employee.create&action=core.auth.sign_in`)
            .expect(200)
        ).body.meta.total,
      ).toBe(1);
      expect((await http(app).get(`/audit?q=${q}&module=hr`).expect(200)).body.meta.total).toBe(2);
      expect((await http(app).get(`/audit?q=${q}&module=core`).expect(200)).body.meta.total).toBe(
        0,
      );
      expect(
        (await http(app).get(`/audit?q=${q}&actorId=${user.id}`).expect(200)).body.meta.total,
      ).toBe(2);
      expect(
        (
          await http(app)
            .get(`/audit?q=${q}&actorId=11111111-1111-4111-8111-111111111111`)
            .expect(200)
        ).body.meta.total,
      ).toBe(0);
      expect(
        (await http(app).get(`/audit?q=${q}&from=${from}&to=${to}`).expect(200)).body.meta.total,
      ).toBe(2);
      expect((await http(app).get(`/audit?q=${q}&to=${from}`).expect(200)).body.meta.total).toBe(0);
      expect((await http(app).get(`/audit?q=${q}&from=${to}`).expect(200)).body.meta.total).toBe(0);

      const paged = await http(app).get(`/audit?q=${q}&page=2&limit=1`).expect(200);
      expect(paged.body.data.map((e: AuditEntry) => e.action)).toEqual(['hr.employee.create']);
      expect(paged.body.meta).toMatchObject({
        total: 2,
        page: 2,
        limit: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      });
    });

    it.each([
      ['limit over 100', 'limit=101'],
      ['limit 0', 'limit=0'],
      ['page 0', 'page=0'],
      ['unknown action', 'action=hr.employee.delete'],
      ['an unknown action among known ones', 'action=hr.employee.create,hr.employee.delete'],
      ['an empty action list', 'action=,'],
      ['unknown module', 'module=fees'],
      ['actorId not a uuid', 'actorId=abc'],
      ['from not a date', 'from=yesterday'],
      ['an unknown filter', 'colour=teal'],
      ['from not before to', 'from=2026-11-17T10:00:00Z&to=2026-11-17T09:00:00Z'],
    ])('400 for %s', async (_, query) => {
      await http(app).get(`/audit?${query}`).expect(400);
    });

    it('needs a session', async () => {
      await http(app).get('/audit').set(ANONYMOUS_HEADER, '1').expect(401);
      await http(app).get('/audit/records/employee/x').set(ANONYMOUS_HEADER, '1').expect(401);
    });

    it('has no write endpoints', async () => {
      await http(app).post('/audit').send({}).expect(404);
      await http(app).delete('/audit/records/employee/x').expect(404);
    });
  });

  describe('record names in both languages (UI audit finding 3)', () => {
    it('stores both names, returns them as { en, ar } and finds the entry by either name', async () => {
      const en = unique('Strike');
      const ar = `إضراب ${Date.now()}`;
      const id = `named-${Date.now()}`;
      await http(app)
        .post(`/__audit-probe/named/${id}?en=${encodeURIComponent(en)}&ar=${encodeURIComponent(ar)}`)
        .expect(201);
      const byEn = await http(app).get(`/audit?q=${encodeURIComponent(en)}`).expect(200);
      expect(byEn.body.data).toHaveLength(1);
      expect(byEn.body.data[0].entityLabel).toEqual({ en, ar });
      const byAr = await http(app).get(`/audit?q=${encodeURIComponent(ar)}`).expect(200);
      expect(byAr.body.data.map((e: AuditEntry) => e.entityId)).toEqual([id]);
    });
  });

  describe('GET /audit/day-totals (UI audit finding 2)', () => {
    it("counts the whole period for the same filters, one total per period, whatever the page size", async () => {
      const label = unique('Day Totals');
      const q = encodeURIComponent(label);
      const from = new Date(Date.now() - 1000).toISOString();
      for (let i = 0; i < 3; i++) {
        await http(app).post(`/__audit-probe/two/day-${Date.now()}-${i}?label=${q}`).expect(201);
      }
      const to = new Date(Date.now() + 1000).toISOString();
      const empty = '2001-01-01T00:00:00.000Z/2001-01-02T00:00:00.000Z';
      // Page 1 of 2 holds 2 entries; the period holds all 6.
      const page = await http(app).get(`/audit?q=${q}&limit=2`).expect(200);
      expect(page.body.data).toHaveLength(2);
      const res = await http(app)
        .get(`/audit/day-totals?q=${q}&periods=${encodeURIComponent(`${from}/${to}`)},${encodeURIComponent(empty)}`)
        .expect(200);
      expect(res.body.data).toEqual([6, 0]);
      const created = await http(app)
        .get(`/audit/day-totals?q=${q}&action=hr.employee.create&periods=${encodeURIComponent(`${from}/${to}`)}`)
        .expect(200);
      expect(created.body.data).toEqual([3]);
    });

    it('400 on a missing, malformed or backwards period, or too many; needs a session', async () => {
      await http(app).get('/audit/day-totals').expect(400);
      await http(app).get('/audit/day-totals?periods=yesterday').expect(400);
      await http(app)
        .get(`/audit/day-totals?periods=${encodeURIComponent('2026-11-17T10:00:00Z/2026-11-17T09:00:00Z')}`)
        .expect(400);
      const day = encodeURIComponent('2026-11-17T00:00:00Z/2026-11-18T00:00:00Z');
      await http(app).get(`/audit/day-totals?periods=${Array(32).fill(day).join(',')}`).expect(400);
      await http(app).get(`/audit/day-totals?periods=${day}`).set(ANONYMOUS_HEADER, '1').expect(401);
    });
  });

  describe('GET /audit/records/:entityType/:entityId', () => {
    it('an unknown record type → 400; a record with no entries → an empty page', async () => {
      await http(app).get('/audit/records/student/x').expect(400);
      const res = await http(app)
        .get(`/audit/records/employee/${unique('none')}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({ total: 0, page: 1 });
      await http(app).get('/audit/records/employee/x?limit=101').expect(400);
    });

    it("shows only that record's entries", async () => {
      const a = `rec-a-${Date.now()}`;
      const b = `rec-b-${Date.now()}`;
      await http(app).post(`/__audit-probe/two/${a}?label=A`).expect(201);
      await http(app).post(`/__audit-probe/two/${b}?label=B`).expect(201);
      const res = await http(app).get(`/audit/records/employee/${a}`).expect(200);
      expect(res.body.data.every((e: AuditEntry) => e.entityId === a)).toBe(true);
      expect(res.body.meta.total).toBe(2);
    });

    it('filters by changed field and by person; lists the fields the record changed', async () => {
      const id = `rec-f-${Date.now()}`;
      await http(app).post(`/__audit-probe/two/${id}?label=F`).expect(201);

      const salary = await http(app).get(`/audit/records/employee/${id}?field=basicSalary`).expect(200);
      expect(salary.body.data.map((e: AuditEntry) => e.action)).toEqual(['hr.employee.update']);
      const name = await http(app).get(`/audit/records/employee/${id}?field=nameEn`).expect(200);
      expect(name.body.data.map((e: AuditEntry) => e.action)).toEqual(['hr.employee.create']);
      expect(
        (await http(app).get(`/audit/records/employee/${id}?field=colour`).expect(200)).body.meta
          .total,
      ).toBe(0);
      expect(
        (await http(app).get(`/audit/records/employee/${id}?actorId=${user.id}`).expect(200)).body
          .meta.total,
      ).toBe(2);
      expect(
        (
          await http(app)
            .get(`/audit/records/employee/${id}?actorId=11111111-1111-4111-8111-111111111111`)
            .expect(200)
        ).body.meta.total,
      ).toBe(0);
      await http(app).get(`/audit/records/employee/${id}?actorId=abc`).expect(400);

      const fields = await http(app).get(`/audit/records/employee/${id}/fields`).expect(200);
      expect(fields.body.data).toEqual(['basicSalary', 'nameEn', 'phone']);
      const none = await http(app).get(`/audit/records/employee/${unique('none')}/fields`).expect(200);
      expect(none.body.data).toEqual([]);
    });
  });

  describe('GET /audit/actors', () => {
    it('everyone in the log once, with their latest name; or only the people on one record', async () => {
      const id = `act-${Date.now()}`;
      await http(app).post(`/__audit-probe/two/${id}?label=Act`).expect(201);

      const all = await http(app).get('/audit/actors').expect(200);
      const ids = all.body.data.map((a: { id: string }) => a.id);
      expect(ids).toContain(user.id);
      expect(new Set(ids).size).toBe(ids.length);
      // The signed-in user acted last, so they come first.
      expect(all.body.data[0]).toEqual({ id: user.id, name: user.name });

      const onRecord = await http(app).get(`/audit/actors?entityType=employee&entityId=${id}`).expect(200);
      expect(onRecord.body.data).toEqual([{ id: user.id, name: user.name }]);
      const nobody = await http(app)
        .get(`/audit/actors?entityType=employee&entityId=${unique('none')}`)
        .expect(200);
      expect(nobody.body.data).toEqual([]);
    });

    it('400 when only one of entityType / entityId is given, or the type is unknown', async () => {
      await http(app).get('/audit/actors?entityType=employee').expect(400);
      await http(app).get('/audit/actors?entityId=x').expect(400);
      await http(app).get('/audit/actors?entityType=student&entityId=x').expect(400);
    });
  });

  describe('GET /audit/summary', () => {
    it('counts entries, people, money entries and failed sign-ins in the period', async () => {
      const from = new Date(Date.now() - 1000);
      const before = (
        await http(app)
          .get(`/audit/summary?from=${from.toISOString()}&to=${new Date(Date.now() + 60_000).toISOString()}`)
          .expect(200)
      ).body.data;
      // Two entries: a create (not money) and an update of basicSalary (money).
      await http(app).post(`/__audit-probe/two/sum-${Date.now()}?label=Sum`).expect(201);
      const after = (
        await http(app)
          .get(`/audit/summary?from=${from.toISOString()}&to=${new Date(Date.now() + 60_000).toISOString()}`)
          .expect(200)
      ).body.data;
      expect(after.actions - before.actions).toBe(2);
      expect(after.money - before.money).toBe(1);
      expect(after.failedSignIns).toBe(before.failedSignIns);
      expect(after.people).toBeGreaterThanOrEqual(1);

      const empty = await http(app)
        .get('/audit/summary?from=2001-01-01T00:00:00Z&to=2001-01-02T00:00:00Z')
        .expect(200);
      expect(empty.body.data).toEqual({ actions: 0, people: 0, money: 0, failedSignIns: 0 });
    });

    it('400 without both edges, or when from is not before to', async () => {
      await http(app).get('/audit/summary').expect(400);
      await http(app).get('/audit/summary?from=2026-11-17T00:00:00Z').expect(400);
      await http(app)
        .get('/audit/summary?from=2026-11-17T10:00:00Z&to=2026-11-17T09:00:00Z')
        .expect(400);
    });

    it('needs a session', async () => {
      await http(app).get('/audit/summary').set(ANONYMOUS_HEADER, '1').expect(401);
      await http(app).get('/audit/actors').set(ANONYMOUS_HEADER, '1').expect(401);
      await http(app).get('/audit/records/employee/x/fields').set(ANONYMOUS_HEADER, '1').expect(401);
    });
  });
});
