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
        entityLabel: label,
        actor: { id: temp.id, name: 'Old Name' },
      });

      // The signed-in user renamed: their old entries keep the old name.
      await db.user.update({ where: { id: user.id }, data: { name: 'Renamed Admin' } });
      const mine = await http(app).get(`/audit?actorId=${user.id}&limit=1`).expect(200);
      expect(mine.body.data[0].actor).toEqual({ id: user.id, name: user.name });
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
  });
});
