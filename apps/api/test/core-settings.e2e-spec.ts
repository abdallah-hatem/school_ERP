import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import {
  LOGO_UPLOAD,
  SETTINGS_HISTORY_ACTION_KEYS,
  SettingsEvent,
  type AuthUser,
  type SettingsChangedEvent,
} from '@school-erp/shared';
import { DomainEvents } from '../src/core/events';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser } from './helpers/as-test-user';
import { historyMark, historyRows } from './helpers/history';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe('core settings and school structure (e2e)', () => {
  let app: INestApplication;
  let TEST_USER: AuthUser;
  let db: DatabaseService;
  const createdStageIds: string[] = [];
  const cleanup: Array<() => Promise<unknown>> = [];

  // The audit log is append-only: read the history written after `mark` (reset = a new mark).
  let mark = BigInt(0);
  const historyFor = (key: string) => historyRows(db, mark, key);
  const resetHistory = async () => {
    mark = await historyMark(db);
  };

  beforeAll(async () => {
    ({ app, user: TEST_USER } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    // A fresh settings state: no rows means every key is at its §7 default.
    await resetHistory();
    await db.schoolSetting.deleteMany();
  });

  afterAll(async () => {
    // In the order pushed: an employee goes before its department and job title.
    for (const fn of cleanup) await fn();
    await db.stage.deleteMany({ where: { id: { in: createdStageIds } } });
    await db.schoolSetting.deleteMany();
    await app.close();
  });

  describe('/settings/school', () => {
    it('fresh database: school defaults = English, 07:30 / 15:00, Sunday–Thursday', async () => {
      const res = await http(app).get('/settings/school').expect(200);
      expect(res.body.data).toEqual({
        nameEn: '',
        nameAr: '',
        logoUrl: null,
        defaultLanguage: 'en',
        workStart: '07:30',
        workEnd: '15:00',
        workingDays: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
      });
    });

    it('PATCH workEnd earlier than workStart → 400, nothing saved', async () => {
      const before = (await historyRows(db, mark)).length;
      const res = await http(app)
        .patch('/settings/school')
        .send({ workStart: '09:00', workEnd: '08:00', nameEn: 'Ignored' })
        .expect(400);
      expect(res.body).toMatchObject({ success: false, error: 'INVALID_WORK_HOURS' });

      // workEnd alone earlier than the stored workStart is refused too.
      await http(app).patch('/settings/school').send({ workEnd: '07:00' }).expect(400);

      const after = await http(app).get('/settings/school').expect(200);
      expect(after.body.data).toMatchObject({ workStart: '07:30', workEnd: '15:00', nameEn: '' });
      expect((await historyRows(db, mark)).length).toBe(before);
      expect(await db.schoolSetting.count({ where: { key: { startsWith: 'school.' } } })).toBe(0);
    });

    it('PATCH an unknown key → 400 (whitelist)', async () => {
      const res = await http(app)
        .patch('/settings/school')
        .send({ favouriteColour: 'teal' })
        .expect(400);
      expect(res.body).toMatchObject({ success: false, error: 'VALIDATION_FAILED' });
      // logoUrl is set only by the upload route.
      await http(app).patch('/settings/school').send({ logoUrl: '/files/logo/x.png' }).expect(400);
    });

    it.each([
      ['invalid defaultLanguage', { defaultLanguage: 'fr' }],
      ['empty workingDays', { workingDays: [] }],
      ['unknown workingDays', { workingDays: ['SUNDAY', 'FUNDAY'] }],
      ['duplicate workingDays', { workingDays: ['SUNDAY', 'SUNDAY'] }],
      ['malformed time', { workStart: '7:30' }],
      ['out-of-range time', { workEnd: '24:00' }],
      ['work start off the 30-minute boundary', { workStart: '07:15' }],
      ['work end off the 30-minute boundary', { workEnd: '15:45' }],
      ['blank name', { nameAr: '   ' }],
    ])(
      'invalid defaultLanguage, empty or unknown workingDays, malformed time → 400 (%s)',
      async (_, body) => {
        const res = await http(app).patch('/settings/school').send(body).expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      },
    );

    it('work times on a 30-minute boundary are accepted; an off-boundary one saves nothing', async () => {
      const res = await http(app)
        .patch('/settings/school')
        .send({ workStart: '06:30', workEnd: '19:30' })
        .expect(200);
      expect(res.body.data).toMatchObject({ workStart: '06:30', workEnd: '19:30' });
      await http(app).patch('/settings/school').send({ workStart: '06:30', workEnd: '19:20' }).expect(400);
      const after = await http(app).get('/settings/school').expect(200);
      expect(after.body.data).toMatchObject({ workStart: '06:30', workEnd: '19:30' });
      // Back to the §7 defaults with no history, as the next tests assume.
      await resetHistory();
      await db.schoolSetting.deleteMany();
    });

    it('every successful change writes one history row with old and new value and the user', async () => {
      const res = await http(app)
        .patch('/settings/school')
        .send({ workStart: '08:00', defaultLanguage: 'en' /* unchanged: no row */ })
        .expect(200);
      expect(res.body.data).toMatchObject({ workStart: '08:00', defaultLanguage: 'en' });

      const rows = await historyFor('school.workStart');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        scope: 'SCHOOL',
        oldValue: '07:30',
        newValue: '08:00',
        changedById: TEST_USER.id,
      });
      expect(await historyFor('school.defaultLanguage')).toHaveLength(0);

      // Saving the same value again is not a change.
      await http(app).patch('/settings/school').send({ workStart: '08:00' }).expect(200);
      expect(await historyFor('school.workStart')).toHaveLength(1);

      // The Settings link opens Activity filtered to the settings actions (T30).
      const settingsActions = SETTINGS_HISTORY_ACTION_KEYS.join(',');
      const history = await http(app).get(`/audit?action=${settingsActions}&limit=5`).expect(200);
      expect(history.body.data[0]).toMatchObject({
        action: 'core.settings.update',
        actor: { id: TEST_USER.id, name: TEST_USER.name },
        changes: [{ field: 'school.workStart', before: '07:30', after: '08:00' }],
      });
      expect(history.body.meta).toMatchObject({ page: 1, limit: 5 });
    });

    it('edge case 11 — an entry copied from the old history reads on Activity, filtered to settings', async () => {
      // The shape the T27 migration writes for an old `setting_changes` row (same id and time).
      const id = randomUUID();
      const at = new Date(); // the newest entry, so the first item
      const snapshot = { id: 'd1', nameEn: 'Science', nameAr: 'العلوم', sortOrder: 1, isActive: true };
      await db.auditEntry.create({
        data: {
          id,
          action: 'hr.department.create',
          module: 'hr',
          entityType: 'department',
          entityId: 'd1',
          entityLabel: 'Science',
          actorId: TEST_USER.id,
          actorName: TEST_USER.name,
          changes: [{ field: 'hr.departments', before: null, after: snapshot }],
          meta: { ip: null, userAgent: null, requestId: null, source: 'setting_changes' },
          at,
        },
      });
      const stored = await db.auditEntry.findUniqueOrThrow({ where: { id }, select: { at: true } });
      const settingsActions = SETTINGS_HISTORY_ACTION_KEYS.join(',');
      const history = await http(app).get(`/audit?action=${settingsActions}&limit=1`).expect(200);
      expect(history.body.data[0]).toMatchObject({
        id,
        action: 'hr.department.create',
        // Written before labels kept both names: the Arabic name is read from its own snapshot
        // (the name as it was then; dry run 2026-11-18), the entry itself is unchanged.
        entityLabel: { en: 'Science', ar: 'العلوم' },
        actor: { id: TEST_USER.id, name: TEST_USER.name },
        changes: [{ field: 'hr.departments', before: null, after: snapshot }],
        at: stored.at.toISOString(),
      });
    });

    it('the old Settings → Change history endpoint is gone (T30: Activity replaces it)', async () => {
      await http(app).get('/settings/history').expect(404);
    });

    it('a core.settings.changed event alone writes no history: every change is recorded in its own transaction', async () => {
      const item = { id: '22222222-2222-4222-8222-222222222222', nameEn: 'Art', nameAr: 'الفنون', sortOrder: 1, isActive: true };
      const event: SettingsChangedEvent = {
        scope: 'lists',
        key: 'hr.departments',
        oldValue: null,
        newValue: item,
        changedById: TEST_USER.id,
        changedAt: new Date().toISOString(),
      };
      await app.get(DomainEvents).publish(SettingsEvent.CHANGED, event);
      const rows = (await historyFor('hr.departments')).filter(
        (r) => (r.newValue as { id?: string } | null)?.id === item.id,
      );
      expect(rows).toHaveLength(0);
    });

    it('an HR or school core.settings.changed event alone writes nothing: those are recorded with their write', async () => {
      const event: SettingsChangedEvent = {
        scope: 'hr',
        key: 'hr.payroll.dayDivisor',
        oldValue: 30,
        newValue: 26,
        changedById: TEST_USER.id,
        changedAt: new Date().toISOString(),
      };
      await app.get(DomainEvents).publish(SettingsEvent.CHANGED, event);
      expect(await historyFor('hr.payroll.dayDivisor')).toHaveLength(0);
    });
  });

  describe('/settings/school/logo', () => {
    it('logo: wrong type → 400', async () => {
      const text = await http(app)
        .post('/settings/school/logo')
        .attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
        .expect(400);
      expect(text.body.error).toBe('INVALID_FILE_TYPE');

      // A text file claiming to be a PNG is still refused (the bytes decide).
      const fake = await http(app)
        .post('/settings/school/logo')
        .attach('file', Buffer.from('not a png'), { filename: 'a.png', contentType: 'image/png' })
        .expect(400);
      expect(fake.body.error).toBe('INVALID_FILE_TYPE');

      await http(app).post('/settings/school/logo').expect(400);
    });

    it('logo: over 2 MB → 413', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(LOGO_UPLOAD.maxBytes, 0)]);
      const res = await http(app)
        .post('/settings/school/logo')
        .attach('file', big, { filename: 'big.png', contentType: 'image/png' })
        .expect(413);
      expect(res.body.error).toBe('FILE_TOO_LARGE');
    });

    it('logo: valid → URL served (public); other files need a session', async () => {
      const res = await http(app)
        .post('/settings/school/logo')
        .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
        .expect(201);
      const logoUrl: string = res.body.data.logoUrl;
      expect(logoUrl).toMatch(/^\/files\/logo\/logo-[0-9a-f-]+\.png$/);

      const settings = await http(app).get('/settings/school').expect(200);
      expect(settings.body.data.logoUrl).toBe(logoUrl);
      expect(await historyFor('school.logoUrl')).toHaveLength(1);

      const file = await http(app).get(logoUrl).set(ANONYMOUS_HEADER, '1').expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(Buffer.from(file.body as Buffer).equals(PNG)).toBe(true);

      await http(app).get('/files/payslips/a.pdf').set(ANONYMOUS_HEADER, '1').expect(401);
      await http(app).get('/settings/school').set(ANONYMOUS_HEADER, '1').expect(401);
      await http(app).get('/files/logo/..%2F..%2Fpackage.json').expect(404);
      await http(app).get('/files/logo/missing.png').expect(404);
    });

    it('an SVG logo is accepted and served with a script-blocking policy', async () => {
      const res = await http(app)
        .post('/settings/school/logo')
        .attach('file', SVG, { filename: 'logo.svg', contentType: 'image/svg+xml' })
        .expect(201);
      const file = await http(app).get(res.body.data.logoUrl).expect(200);
      expect(file.headers['content-type']).toBe('image/svg+xml');
      expect(file.headers['content-security-policy']).toContain('sandbox');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('/stages', () => {
    const createStage = async (body: object) => {
      const res = await http(app).post('/stages').send(body).expect(201);
      createdStageIds.push(res.body.data.id);
      return res.body.data as { id: string; sortOrder: number; isActive: boolean };
    };

    it.each([
      ['missing Arabic', { nameEn: 'Primary' }],
      ['missing English', { nameAr: 'ابتدائي' }],
      ['blank Arabic', { nameEn: 'Primary', nameAr: '  ' }],
      ['unknown key', { nameEn: 'Primary', nameAr: 'ابتدائي', colour: 'red' }],
    ])('stage names: missing Arabic or English → 400 (%s)', async (_, body) => {
      const res = await http(app).post('/stages').send(body).expect(400);
      expect(res.body.error).toBe('VALIDATION_FAILED');
    });

    it('hide a stage used by an employee → allowed (isActive: false); there is no delete route', async () => {
      const stage = await createStage({ nameEn: unique('Stage'), nameAr: 'مرحلة' });
      const department = await db.department.create({
        data: { nameEn: unique('Dept'), nameAr: 'قسم' },
      });
      const jobTitle = await db.jobTitle.create({
        data: { nameEn: unique('Job'), nameAr: 'وظيفة' },
      });
      const employee = await db.employee.create({
        data: {
          code: unique('E2E'),
          nameEn: 'Test Employee',
          nameAr: 'موظف',
          gender: 'FEMALE',
          dateOfBirth: new Date('1990-01-01'),
          phone: '01000000000',
          hireDate: new Date('2024-09-01'),
          stageId: stage.id,
          departmentId: department.id,
          jobTitleId: jobTitle.id,
          workSystem: 'FULL_TIME',
          basicSalary: 1400000,
          contractStart: new Date('2026-06-01'),
          contractEnd: new Date('2027-05-31'),
        },
      });
      cleanup.push(
        () => db.employee.delete({ where: { id: employee.id } }),
        () => db.department.delete({ where: { id: department.id } }),
        () => db.jobTitle.delete({ where: { id: jobTitle.id } }),
      );

      const res = await http(app)
        .patch(`/stages/${stage.id}`)
        .send({ isActive: false })
        .expect(200);
      expect(res.body.data).toMatchObject({ id: stage.id, isActive: false });
      expect((await db.employee.findUnique({ where: { id: employee.id } }))?.stageId).toBe(
        stage.id,
      );

      await http(app).delete(`/stages/${stage.id}`).expect(404);
      expect(await db.stage.findUnique({ where: { id: stage.id } })).not.toBeNull();

      // Hidden: gone from the default list, still there with includeHidden.
      const visible = await http(app).get('/stages').expect(200);
      expect(visible.body.data.map((s: { id: string }) => s.id)).not.toContain(stage.id);
      const all = await http(app).get('/stages?includeHidden=true').expect(200);
      expect(all.body.data.map((s: { id: string }) => s.id)).toContain(stage.id);
    });

    it('PATCH an unknown stage → 404; a malformed id → 400', async () => {
      await http(app)
        .patch('/stages/11111111-1111-4111-8111-111111111111')
        .send({ nameEn: 'X' })
        .expect(404);
      await http(app).patch('/stages/not-a-uuid').send({ nameEn: 'X' }).expect(400);
    });

    it('full flow: create, list in order, rename, hide and show — each change in the history', async () => {
      const a = await createStage({ nameEn: unique('Alpha'), nameAr: 'أ', sortOrder: 9000 });
      const b = await createStage({ nameEn: unique('Beta'), nameAr: 'ب' });
      expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
      expect(b.isActive).toBe(true);

      const list = await http(app).get('/stages').expect(200);
      const ids = list.body.data.map((s: { id: string }) => s.id);
      expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
      expect(Object.keys(list.body.data[0]).sort()).toEqual(
        ['id', 'isActive', 'isNoStage', 'nameAr', 'nameEn', 'sortOrder'].sort(),
      );

      await http(app).patch(`/stages/${b.id}`).send({ nameAr: 'بيتا' }).expect(200);
      await http(app).patch(`/stages/${b.id}`).send({ isActive: false }).expect(200);
      await http(app).patch(`/stages/${b.id}`).send({ isActive: true }).expect(200);

      // Written in each request's own transaction: there when the response is, no waiting.
      const key = `lists.stages.${b.id}`;
      const rows = await historyFor(key);
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.scope)).toEqual(['LISTS', 'LISTS', 'LISTS', 'LISTS']);
      expect(rows.map((r) => r.action)).toEqual([
        'core.stage.create',
        'core.stage.update',
        'core.stage.update',
        'core.stage.update',
      ]);
      expect(rows[0].oldValue).toBeNull();
      expect(rows[1]).toMatchObject({
        oldValue: expect.objectContaining({ nameAr: 'ب' }),
        newValue: expect.objectContaining({ nameAr: 'بيتا' }),
        changedById: TEST_USER.id,
      });
    });

    it('a normal change writes exactly one history entry and one audit entry; a no-op save writes none', async () => {
      const stage = await createStage({ nameEn: unique('Stage'), nameAr: 'مرحلة' });
      const before = await historyMark(db);
      await http(app).patch(`/stages/${stage.id}`).send({ nameAr: 'مرحلة ٢' }).expect(200);
      await http(app).patch(`/stages/${stage.id}`).send({ nameAr: 'مرحلة ٢' }).expect(200);

      const history = await historyRows(db, before, `lists.stages.${stage.id}`);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ action: 'core.stage.update', changedById: TEST_USER.id });
      const entries = await db.auditEntry.findMany({
        where: { seq: { gt: before }, entityType: 'stage', entityId: stage.id },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(history[0].entryId);

      const record = await http(app).get(`/audit/records/stage/${stage.id}`).expect(200);
      expect(
        (record.body.data as { action: string }[]).map((e) => e.action).sort(),
      ).toEqual(['core.stage.create', 'core.stage.update']);
    });
  });
});
