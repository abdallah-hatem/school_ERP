import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  contractYearFor,
  ErrorCode,
  HrEvent,
  HrListKey,
  SettingsEvent,
  type CreateEmployeeRequest,
} from '@school-erp/shared';
import { todayIsoDate } from '../src/common/utils/dates.util';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';

describe('HR lists and employees (e2e)', () => {
  let app: INestApplication;
  let userId: string;
  let db: DatabaseService;
  let emitSpy: jest.SpyInstance;

  let stageId: string;
  let hiddenStageId: string;
  let departmentId: string;
  let otherDepartmentId: string;
  let hiddenDepartmentId: string;
  /** Manages people — every employee created by default can be a direct manager. */
  let jobTitleId: string;
  /** Doesn't manage people (§3 direct managers). */
  let plainTitleId: string;
  let hiddenJobTitleId: string;

  const MISSING_ID = '11111111-1111-4111-8111-111111111111';
  let nid = 0;
  /** A fresh unique 14-digit national ID. */
  const nationalId = () => `2${String(Date.now()).slice(-9)}${String(nid++).padStart(4, '0')}`;

  const body = (overrides: Partial<CreateEmployeeRequest> = {}): CreateEmployeeRequest => ({
    nameEn: unique('Employee'),
    nameAr: unique('موظف'),
    gender: 'FEMALE',
    dateOfBirth: '1990-04-12',
    phone: '01000000000',
    hireDate: '2024-09-01',
    stageId,
    departmentId,
    jobTitleId,
    workSystem: 'FULL_TIME',
    basicSalary: 1400000,
    ...overrides,
  });

  const create = (overrides: Partial<CreateEmployeeRequest> = {}) =>
    http(app).post('/hr/employees').send(body(overrides));

  const createOk = async (overrides: Partial<CreateEmployeeRequest> = {}) => {
    const res = await create(overrides).expect(201);
    return res.body.data as { id: string; code: string; status: string };
  };

  const settingsEvents = () =>
    emitSpy.mock.calls
      .filter(([name]) => name === SettingsEvent.CHANGED)
      .map(([, payload]) => payload);

  beforeAll(async () => {
    ({
      app,
      user: { id: userId },
    } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    emitSpy = jest.spyOn(app.get(EventEmitter2), 'emit');

    stageId = (await db.stage.create({ data: { nameEn: 'Primary', nameAr: 'ابتدائي' } })).id;
    hiddenStageId = (
      await db.stage.create({ data: { nameEn: 'Old', nameAr: 'قديم', isActive: false } })
    ).id;

    const mk = async (path: string, nameEn: string) =>
      (
        await http(app)
          .post(path)
          .send({ nameEn, nameAr: `${nameEn}-ar` })
          .expect(201)
      ).body.data.id as string;
    departmentId = await mk('/hr/departments', 'Teaching');
    otherDepartmentId = await mk('/hr/departments', 'Admin');
    hiddenDepartmentId = await mk('/hr/departments', 'Closed');
    jobTitleId = (
      await http(app)
        .post('/hr/job-titles')
        .send({ nameEn: 'Head of Department', nameAr: 'رئيس القسم', managesPeople: true })
        .expect(201)
    ).body.data.id as string;
    plainTitleId = await mk('/hr/job-titles', 'Teacher');
    hiddenJobTitleId = await mk('/hr/job-titles', 'Retired title');
    await http(app)
      .patch(`/hr/departments/${hiddenDepartmentId}`)
      .send({ isActive: false })
      .expect(200);
    await http(app)
      .patch(`/hr/job-titles/${hiddenJobTitleId}`)
      .send({ isActive: false })
      .expect(200);
  });

  beforeEach(() => emitSpy.mockClear());

  afterAll(async () => {
    await db.employee.updateMany({ data: { managerId: null } });
    await db.employee.deleteMany({});
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await app.close();
  });

  // ── HR lists ──────────────────────────────────────────────────────────────

  describe('departments and job titles', () => {
    it('no DELETE route (404); hidden ones rejected for new employees; both names required', async () => {
      await http(app).delete(`/hr/departments/${departmentId}`).expect(404);
      await http(app).delete(`/hr/job-titles/${jobTitleId}`).expect(404);

      for (const path of ['/hr/departments', '/hr/job-titles']) {
        await http(app).post(path).send({ nameEn: 'Only English' }).expect(400);
        await http(app).post(path).send({ nameAr: 'عربي فقط' }).expect(400);
        await http(app).post(path).send({ nameEn: '  ', nameAr: 'عربي' }).expect(400);
      }

      const d = await create({ departmentId: hiddenDepartmentId }).expect(400);
      expect(d.body.error).toBe(ErrorCode.LIST_ITEM_HIDDEN);
      const j = await create({ jobTitleId: hiddenJobTitleId }).expect(400);
      expect(j.body.error).toBe(ErrorCode.LIST_ITEM_HIDDEN);
    });

    it('GET hides hidden items unless includeHidden=true', async () => {
      const visible = (await http(app).get('/hr/departments').expect(200)).body.data as {
        id: string;
      }[];
      expect(visible.map((d) => d.id)).not.toContain(hiddenDepartmentId);
      const all = (await http(app).get('/hr/departments?includeHidden=true').expect(200)).body
        .data as { id: string; isActive: boolean }[];
      expect(all.find((d) => d.id === hiddenDepartmentId)).toMatchObject({ isActive: false });
    });

    it('hiding an item used by an employee is allowed and the employee keeps it', async () => {
      const dept = (
        await http(app).post('/hr/departments').send({ nameEn: 'Temp', nameAr: 'مؤقت' }).expect(201)
      ).body.data.id as string;
      const emp = await createOk({ departmentId: dept });
      await http(app).patch(`/hr/departments/${dept}`).send({ isActive: false }).expect(200);
      const got = await http(app).get(`/hr/employees/${emp.id}`).expect(200);
      expect(got.body.data.department.id).toBe(dept);
      // An unrelated edit keeps the (now hidden) department.
      await http(app).patch(`/hr/employees/${emp.id}`).send({ grade: 'B' }).expect(200);
    });

    it('list create / PATCH writes a history row (settings.changed emitted with old and new value)', async () => {
      const created = await http(app)
        .post('/hr/job-titles')
        .send({ nameEn: 'Driver', nameAr: 'سائق', sortOrder: 3 })
        .expect(201);
      const item = created.body.data;
      await http(app).patch(`/hr/job-titles/${item.id}`).send({ nameEn: 'Bus driver' }).expect(200);
      // An empty PATCH changes nothing and records nothing.
      await http(app).patch(`/hr/job-titles/${item.id}`).send({}).expect(200);

      const events = settingsEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        scope: 'lists',
        key: HrListKey.JOB_TITLES,
        oldValue: null,
        newValue: {
          id: item.id,
          nameEn: 'Driver',
          nameAr: 'سائق',
          sortOrder: 3,
          isActive: true,
          managesPeople: false,
        },
        changedById: userId,
        changedAt: expect.any(String),
      });
      expect(events[1]).toMatchObject({
        scope: 'lists',
        key: HrListKey.JOB_TITLES,
        oldValue: { nameEn: 'Driver' },
        newValue: { nameEn: 'Bus driver' },
        changedById: userId,
      });

      emitSpy.mockClear();
      await http(app)
        .post('/hr/departments')
        .send({ nameEn: 'Finance', nameAr: 'مالية' })
        .expect(201);
      expect(settingsEvents()).toEqual([
        expect.objectContaining({ scope: 'lists', key: HrListKey.DEPARTMENTS, oldValue: null }),
      ]);
    });
  });

  // ── Employees ─────────────────────────────────────────────────────────────

  describe('codes', () => {
    it('two employees created at the same time get different codes; codes never reused', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => create()));
      results.forEach((r) => expect(r.status).toBe(201));
      const codes = results.map((r) => r.body.data.code as string);
      expect(new Set(codes).size).toBe(codes.length);
      codes.forEach((c) => expect(c).toMatch(/^EMP-\d{4,}$/));

      // Remove the highest-coded row outright: the next employee still gets a new, higher code.
      const num = (c: string) => Number(c.slice(4));
      const highest = Math.max(...codes.map(num));
      await db.employee.deleteMany({ where: { code: codes.find((c) => num(c) === highest) } });
      const next = await createOk();
      expect(num(next.code)).toBeGreaterThan(highest);
      expect(codes).not.toContain(next.code);
    });
  });

  describe('validation', () => {
    it.each([
      'nameEn',
      'nameAr',
      'gender',
      'dateOfBirth',
      'phone',
      'hireDate',
      'stageId',
      'departmentId',
      'jobTitleId',
      'workSystem',
      'basicSalary',
    ] as const)('missing required field %s → 400', async (field) => {
      const b: Record<string, unknown> = { ...body() };
      delete b[field];
      const res = await http(app).post('/hr/employees').send(b).expect(400);
      expect(res.body.error).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('no national ID / email / address / manager / grade / fingerprint → 201; invalid email → 400', async () => {
      const res = await create().expect(201);
      expect(res.body.data).toMatchObject({
        nationalId: null,
        email: null,
        address: null,
        manager: null,
        grade: null,
        fingerprintId: null,
        usesBus: false,
        status: 'ACTIVE',
      });
      await create({ email: 'not-an-email' }).expect(400);
    });

    it('national ID not 14 digits → 400; duplicate → 409', async () => {
      await create({ nationalId: '1234567890123' }).expect(400);
      await create({ nationalId: '123456789012345' }).expect(400);
      await create({ nationalId: '1234567890123a' }).expect(400);
      const id = nationalId();
      await createOk({ nationalId: id });
      const dup = await create({ nationalId: id }).expect(409);
      expect(dup.body.error).toBe(ErrorCode.DUPLICATE_NATIONAL_ID);
    });

    it('duplicate fingerprint ID → 409', async () => {
      const fp = unique('fp');
      await createOk({ fingerprintId: fp });
      const dup = await create({ fingerprintId: fp }).expect(409);
      expect(dup.body.error).toBe(ErrorCode.DUPLICATE_FINGERPRINT_ID);
    });

    it('hire date in the future → 400', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await create({ hireDate: todayIsoDate(tomorrow) }).expect(400);
      await create({ hireDate: todayIsoDate() }).expect(201);
      await create({ hireDate: '2024-02-30' }).expect(400);
    });

    it('basic salary 0 or negative → 400; non-integer piastres → 400', async () => {
      await create({ basicSalary: 0 }).expect(400);
      await create({ basicSalary: -100 }).expect(400);
      await create({ basicSalary: 1400000.5 }).expect(400);
      await create({ basicSalary: '1400000' as unknown as number }).expect(400);
      await create({ basicSalary: 1 }).expect(201);
    });

    it('workSystem outside the 4 values → 400', async () => {
      await create({ workSystem: 'PART_TIME_5' as never }).expect(400);
      await create({ workSystem: 'full_time' as never }).expect(400);
      for (const ws of ['FULL_TIME', 'PART_TIME_4', 'PART_TIME_3', 'PART_TIME_2'] as const) {
        await create({ workSystem: ws }).expect(201);
      }
    });

    it('department / stage / job title id that does not exist or is hidden → 400', async () => {
      for (const o of [
        { stageId: MISSING_ID },
        { departmentId: MISSING_ID },
        { jobTitleId: MISSING_ID },
      ]) {
        const res = await create(o).expect(400);
        expect(res.body.error).toBe(ErrorCode.FOREIGN_KEY_VIOLATION);
      }
      for (const o of [
        { stageId: hiddenStageId },
        { departmentId: hiddenDepartmentId },
        { jobTitleId: hiddenJobTitleId },
      ]) {
        const res = await create(o).expect(400);
        expect(res.body.error).toBe(ErrorCode.LIST_ITEM_HIDDEN);
      }
      await create({ stageId: 'not-a-uuid' }).expect(400);
    });

    it('contract defaults to 1 Jun – 31 May of the current contract year; end before start → 400', async () => {
      const current = contractYearFor(todayIsoDate());
      const res = await create().expect(201);
      expect(res.body.data.contractStart).toBe(current.start);
      expect(res.body.data.contractEnd).toBe(current.end);
      expect(current.start.endsWith('-06-01')).toBe(true);
      expect(current.end.endsWith('-05-31')).toBe(true);

      await create({ contractStart: '2026-06-01', contractEnd: '2026-05-31' }).expect(400);
      await create({ contractStart: '2026-06-01', contractEnd: '2026-06-01' }).expect(400);
      const ok = await create({ contractStart: '2026-09-01' }).expect(201);
      expect(ok.body.data.contractEnd).toBe('2027-08-31');

      // PATCH checks the merged dates too.
      await http(app)
        .patch(`/hr/employees/${ok.body.data.id}`)
        .send({ contractEnd: '2026-08-01' })
        .expect(400);
    });

    it('code and status cannot be sent', async () => {
      await create({ code: 'EMP-9999' } as never).expect(400);
      await create({ status: 'INACTIVE' } as never).expect(400);
    });
  });

  describe('managers', () => {
    it('direct manager = self → 400; manager chain loop (A→B→A) → 400; inactive manager → 400', async () => {
      const a = await createOk();
      const self = await http(app)
        .patch(`/hr/employees/${a.id}`)
        .send({ managerId: a.id })
        .expect(400);
      expect(self.body.error).toBe(ErrorCode.INVALID_MANAGER);

      const b = await createOk({ managerId: a.id });
      const loop = await http(app)
        .patch(`/hr/employees/${a.id}`)
        .send({ managerId: b.id })
        .expect(400);
      expect(loop.body.error).toBe(ErrorCode.MANAGER_LOOP);

      const inactive = await createOk();
      await http(app).post(`/hr/employees/${inactive.id}/deactivate`).expect(200);
      const res = await create({ managerId: inactive.id }).expect(400);
      expect(res.body.error).toBe(ErrorCode.INVALID_MANAGER);
      await create({ managerId: MISSING_ID }).expect(400);
    });

    it('PATCH manager to an inactive employee → 400; a 3-step loop A→B→C→A → 400', async () => {
      const a = await createOk();
      const b = await createOk({ managerId: a.id });
      const c = await createOk({ managerId: b.id });
      const loop = await http(app)
        .patch(`/hr/employees/${a.id}`)
        .send({ managerId: c.id })
        .expect(400);
      expect(loop.body.error).toBe(ErrorCode.MANAGER_LOOP);

      const gone = await createOk();
      await http(app).post(`/hr/employees/${gone.id}/deactivate`).expect(200);
      const res = await http(app)
        .patch(`/hr/employees/${c.id}`)
        .send({ managerId: gone.id })
        .expect(400);
      expect(res.body.error).toBe(ErrorCode.INVALID_MANAGER);

      // A valid change and clearing the manager both work.
      const changed = await http(app).patch(`/hr/employees/${c.id}`).send({ managerId: a.id }).expect(200);
      // The manager reference carries what the avatar needs (photo, else a gendered silhouette).
      expect(changed.body.data.manager).toMatchObject({ id: a.id, photoUrl: null, gender: 'FEMALE' });
      const cleared = await http(app)
        .patch(`/hr/employees/${c.id}`)
        .send({ managerId: null })
        .expect(200);
      expect(cleared.body.data.manager).toBeNull();
    });
  });

  describe('managing job titles (§3, 2026-11-18)', () => {
    it('job-title CRUD carries managesPeople: defaults to false, set on create, toggled by PATCH', async () => {
      const plain = (
        await http(app).post('/hr/job-titles').send({ nameEn: 'Clerk', nameAr: 'كاتب' }).expect(201)
      ).body.data;
      expect(plain).toMatchObject({ nameEn: 'Clerk', managesPeople: false, isActive: true });
      const lead = (
        await http(app)
          .post('/hr/job-titles')
          .send({ nameEn: 'Stage Head', nameAr: 'رئيس المرحلة', managesPeople: true })
          .expect(201)
      ).body.data;
      expect(lead.managesPeople).toBe(true);

      emitSpy.mockClear();
      const on = await http(app)
        .patch(`/hr/job-titles/${plain.id}`)
        .send({ managesPeople: true })
        .expect(200);
      expect(on.body.data).toMatchObject({ id: plain.id, managesPeople: true, nameEn: 'Clerk' });
      expect(settingsEvents()).toEqual([
        expect.objectContaining({
          key: HrListKey.JOB_TITLES,
          oldValue: expect.objectContaining({ managesPeople: false }),
          newValue: expect.objectContaining({ managesPeople: true }),
        }),
      ]);

      const listed = (await http(app).get('/hr/job-titles').expect(200)).body.data as {
        id: string;
        managesPeople: boolean;
      }[];
      expect(listed.find((t) => t.id === plain.id)?.managesPeople).toBe(true);
      expect(listed.find((t) => t.id === plainTitleId)?.managesPeople).toBe(false);

      await http(app)
        .patch(`/hr/job-titles/${plain.id}`)
        .send({ managesPeople: 'yes' })
        .expect(400);
      await http(app)
        .post('/hr/job-titles')
        .send({ nameEn: 'X', nameAr: 'س', managesPeople: 1 })
        .expect(400);
      // Departments don't have the switch.
      await http(app)
        .post('/hr/departments')
        .send({ nameEn: 'Y', nameAr: 'ص', managesPeople: true })
        .expect(400);
    });

    it('picker query: managesPeople=true lists only active managers, excludeId leaves one out', async () => {
      const tag = unique('Picker');
      const lead = await createOk({ nameEn: `${tag} Lead` });
      const other = await createOk({ nameEn: `${tag} Other lead` });
      const plain = await createOk({ nameEn: `${tag} Plain`, jobTitleId: plainTitleId });
      const gone = await createOk({ nameEn: `${tag} Gone` });
      await http(app).post(`/hr/employees/${gone.id}/deactivate`).expect(200);

      const ids = async (q: string) =>
        (
          (
            await http(app)
              .get(`/hr/employees?limit=100&search=${encodeURIComponent(tag)}&${q}`)
              .expect(200)
          ).body.data as { id: string }[]
        ).map((e) => e.id);

      expect(await ids('status=ACTIVE&managesPeople=true')).toEqual([lead.id, other.id]);
      expect(await ids(`status=ACTIVE&managesPeople=true&excludeId=${lead.id}`)).toEqual([
        other.id,
      ]);
      expect(await ids('managesPeople=false')).toEqual([plain.id]);
      expect(await ids('')).toEqual([lead.id, other.id, plain.id, gone.id]);
      // Search by code still works with the filter.
      const byCode = await http(app)
        .get(`/hr/employees?search=${other.code}&status=ACTIVE&managesPeople=true`)
        .expect(200);
      expect((byCode.body.data as { id: string }[]).map((e) => e.id)).toEqual([other.id]);

      await http(app).get('/hr/employees?managesPeople=maybe').expect(400);
      await http(app).get('/hr/employees?excludeId=not-a-uuid').expect(400);
    });

    it('choosing a non-manager is refused (create and PATCH) with a translated message', async () => {
      const plain = await createOk({ jobTitleId: plainTitleId });
      const en = await create({ managerId: plain.id }).set('Accept-Language', 'en').expect(400);
      expect(en.body).toMatchObject({
        error: ErrorCode.MANAGER_NOT_MANAGING,
        message: 'The direct manager must hold a job title that manages people.',
      });
      const ar = await create({ managerId: plain.id }).set('Accept-Language', 'ar').expect(400);
      expect(ar.body).toMatchObject({
        error: ErrorCode.MANAGER_NOT_MANAGING,
        message: 'يجب أن يشغل المدير المباشر مسمى وظيفيًا يدير موظفين.',
      });

      const e = await createOk();
      const patch = await http(app)
        .patch(`/hr/employees/${e.id}`)
        .send({ managerId: plain.id })
        .expect(400);
      expect(patch.body.error).toBe(ErrorCode.MANAGER_NOT_MANAGING);
      const view = await http(app).get(`/hr/employees/${e.id}`).expect(200);
      expect(view.body.data.manager).toBeNull();
    });

    it('a manager who no longer qualifies is kept on unrelated edits, and flagged', async () => {
      const title = (
        await http(app)
          .post('/hr/job-titles')
          .send({ nameEn: unique('Coordinator'), nameAr: 'منسق', managesPeople: true })
          .expect(201)
      ).body.data;
      const boss = await createOk({ jobTitleId: title.id });
      const e = await createOk({ managerId: boss.id });
      const second = await createOk({ managerId: boss.id });
      expect(
        (await http(app).get(`/hr/employees/${e.id}`).expect(200)).body.data.manager,
      ).toMatchObject({
        id: boss.id,
        managesPeople: true,
      });

      // The title stops managing people → the employee keeps the manager, flagged.
      await http(app)
        .patch(`/hr/job-titles/${title.id}`)
        .send({ managesPeople: false })
        .expect(200);
      const kept = await http(app).get(`/hr/employees/${e.id}`).expect(200);
      expect(kept.body.data.manager).toMatchObject({ id: boss.id, managesPeople: false });

      // Unrelated edit, with and without the unchanged manager in the body.
      await http(app).patch(`/hr/employees/${e.id}`).send({ grade: 'G1' }).expect(200);
      const same = await http(app)
        .patch(`/hr/employees/${e.id}`)
        .send({ managerId: boss.id, grade: 'G2' })
        .expect(200);
      expect(same.body.data).toMatchObject({ grade: 'G2', manager: { id: boss.id } });

      // The manager's own title changed to a non-managing one: same rule.
      await http(app).patch(`/hr/job-titles/${title.id}`).send({ managesPeople: true }).expect(200);
      await http(app)
        .patch(`/hr/employees/${boss.id}`)
        .send({ jobTitleId: plainTitleId })
        .expect(200);
      await http(app).patch(`/hr/employees/${second.id}`).send({ grade: 'G3' }).expect(200);

      // Choosing them anew is refused; clearing works.
      const fresh = await createOk();
      const refused = await http(app)
        .patch(`/hr/employees/${fresh.id}`)
        .send({ managerId: boss.id })
        .expect(400);
      expect(refused.body.error).toBe(ErrorCode.MANAGER_NOT_MANAGING);
      const cleared = await http(app)
        .patch(`/hr/employees/${e.id}`)
        .send({ managerId: null })
        .expect(200);
      expect(cleared.body.data.manager).toBeNull();
    });
  });

  describe('updates and status', () => {
    it('PATCH keeping own national ID / fingerprint → 200; taking another employee’s → 409', async () => {
      const n1 = nationalId();
      const n2 = nationalId();
      const one = await createOk({ nationalId: n1, fingerprintId: unique('fp1') });
      const two = await createOk({ nationalId: n2, fingerprintId: unique('fp2') });
      const own = (await http(app).get(`/hr/employees/${one.id}`)).body.data;

      await http(app)
        .patch(`/hr/employees/${one.id}`)
        .send({ nationalId: n1, fingerprintId: own.fingerprintId })
        .expect(200);
      const nid409 = await http(app)
        .patch(`/hr/employees/${two.id}`)
        .send({ nationalId: n1 })
        .expect(409);
      expect(nid409.body.error).toBe(ErrorCode.DUPLICATE_NATIONAL_ID);
      const fp409 = await http(app)
        .patch(`/hr/employees/${two.id}`)
        .send({ fingerprintId: own.fingerprintId })
        .expect(409);
      expect(fp409.body.error).toBe(ErrorCode.DUPLICATE_FINGERPRINT_ID);
    });

    it('PATCH cannot clear a required field', async () => {
      const e = await createOk();
      await http(app).patch(`/hr/employees/${e.id}`).send({ nameEn: null }).expect(400);
      await http(app).patch(`/hr/employees/${e.id}`).send({ basicSalary: null }).expect(400);
    });

    it('deactivate → status inactive, record kept; there is no delete route', async () => {
      const e = await createOk({ nationalId: nationalId() });
      const res = await http(app).post(`/hr/employees/${e.id}/deactivate`).expect(200);
      expect(res.body.data).toMatchObject({ id: e.id, code: e.code, status: 'INACTIVE' });
      expect(emitSpy).toHaveBeenCalledWith(HrEvent.EMPLOYEE_DEACTIVATED, {
        employeeId: e.id,
        at: expect.any(String),
      });
      const got = await http(app).get(`/hr/employees/${e.id}`).expect(200);
      expect(got.body.data.status).toBe('INACTIVE');

      await http(app).delete(`/hr/employees/${e.id}`).expect(404);
      expect(await db.employee.count({ where: { id: e.id } })).toBe(1);
    });

    it('reactivate an inactive employee → ACTIVE, history kept', async () => {
      const e = await createOk({ grade: 'A' });
      await http(app).post(`/hr/employees/${e.id}/deactivate`).expect(200);
      const res = await http(app).post(`/hr/employees/${e.id}/reactivate`).expect(200);
      expect(res.body.data).toMatchObject({ id: e.id, code: e.code, status: 'ACTIVE', grade: 'A' });
    });

    it('unknown employee id → 404; malformed id → 400', async () => {
      await http(app).get(`/hr/employees/${MISSING_ID}`).expect(404);
      await http(app).patch(`/hr/employees/${MISSING_ID}`).send({ grade: 'x' }).expect(404);
      await http(app).post(`/hr/employees/${MISSING_ID}/deactivate`).expect(404);
      await http(app).get('/hr/employees/not-a-uuid').expect(400);
    });
  });

  describe('list', () => {
    it('list filters (department, stage, status, work system) and search by code / EN name / AR name', async () => {
      const tag = unique('Zebra');
      const x = await createOk({
        nameEn: `${tag} One`,
        nameAr: 'زرافة فريدة',
        departmentId: otherDepartmentId,
        workSystem: 'PART_TIME_3',
      });
      const y = await createOk({ nameEn: `${tag} Two`, workSystem: 'PART_TIME_3' });
      await http(app).post(`/hr/employees/${y.id}/deactivate`).expect(200);

      const ids = async (q: string) =>
        (
          (await http(app).get(`/hr/employees?limit=100&${q}`).expect(200)).body.data as {
            id: string;
          }[]
        ).map((e) => e.id);

      expect(await ids(`search=${encodeURIComponent(tag)}`)).toEqual([x.id, y.id]);
      expect(await ids(`search=${encodeURIComponent(tag.toLowerCase())}`)).toEqual([x.id, y.id]);
      expect(await ids(`search=${encodeURIComponent('زرافة')}`)).toEqual([x.id]);
      expect(await ids(`search=${x.code}`)).toEqual([x.id]);
      expect(
        await ids(`search=${encodeURIComponent(tag)}&departmentId=${otherDepartmentId}`),
      ).toEqual([x.id]);
      expect(await ids(`search=${encodeURIComponent(tag)}&status=INACTIVE`)).toEqual([y.id]);
      expect(await ids(`search=${encodeURIComponent(tag)}&status=ACTIVE`)).toEqual([x.id]);
      expect(await ids(`search=${encodeURIComponent(tag)}&workSystem=PART_TIME_3`)).toEqual([
        x.id,
        y.id,
      ]);
      expect(await ids(`search=${encodeURIComponent(tag)}&workSystem=FULL_TIME`)).toEqual([]);
      expect(await ids(`search=${encodeURIComponent(tag)}&stageId=${stageId}`)).toEqual([
        x.id,
        y.id,
      ]);
      expect(await ids(`search=${encodeURIComponent(tag)}&stageId=${hiddenStageId}`)).toEqual([]);

      await http(app).get('/hr/employees?status=GONE').expect(400);
      await http(app).get('/hr/employees?workSystem=PART_TIME_9').expect(400);
      await http(app).get('/hr/employees?departmentId=nope').expect(400);
    });

    it('pagination: limit above 100 → 400', async () => {
      const res = await http(app).get('/hr/employees?limit=101').expect(400);
      expect(res.body.error).toBe(ErrorCode.VALIDATION_FAILED);
      await http(app).get('/hr/employees?limit=0').expect(400);
      await http(app).get('/hr/employees?page=0').expect(400);
      await http(app).get('/hr/employees?limit=100').expect(200);

      const page = await http(app).get('/hr/employees?page=1&limit=2').expect(200);
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta).toMatchObject({
        page: 1,
        limit: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      expect(page.body.meta.total).toBeGreaterThan(2);
    });
  });

  it('full flow: lists → hire → view → edit → list → deactivate → reactivate', async () => {
    const dept = (
      await http(app)
        .post('/hr/departments')
        .send({ nameEn: 'Science', nameAr: 'العلوم' })
        .expect(201)
    ).body.data;
    const title = (
      await http(app)
        .post('/hr/job-titles')
        .send({ nameEn: 'Lab tech', nameAr: 'فني معمل' })
        .expect(201)
    ).body.data;
    const boss = await createOk({ departmentId: dept.id });

    emitSpy.mockClear();
    const hired = await http(app)
      .post('/hr/employees')
      .send(
        body({
          nameEn: 'Sara Ali',
          nameAr: 'سارة علي',
          nationalId: nationalId(),
          email: 'sara@example.test',
          address: 'Cairo',
          departmentId: dept.id,
          jobTitleId: title.id,
          managerId: boss.id,
          grade: 'Grade 2',
          workSystem: 'PART_TIME_4',
          basicSalary: 900050,
          fingerprintId: unique('fp'),
          usesBus: true,
        }),
      )
      .expect(201);
    const e = hired.body.data;
    expect(e.code).toMatch(/^EMP-\d{4,}$/);
    expect(e).toMatchObject({
      nameEn: 'Sara Ali',
      nameAr: 'سارة علي',
      department: { id: dept.id, nameEn: 'Science', nameAr: 'العلوم' },
      jobTitle: { id: title.id },
      stage: { id: stageId },
      manager: { id: boss.id, code: boss.code },
      basicSalary: 900050,
      workSystem: 'PART_TIME_4',
      usesBus: true,
      status: 'ACTIVE',
      dateOfBirth: '1990-04-12',
      hireDate: '2024-09-01',
    });
    expect(emitSpy).toHaveBeenCalledWith(HrEvent.EMPLOYEE_HIRED, {
      employeeId: e.id,
      at: expect.any(String),
    });

    const view = await http(app).get(`/hr/employees/${e.id}`).expect(200);
    expect(view.body.data).toEqual(e);

    const edited = await http(app)
      .patch(`/hr/employees/${e.id}`)
      .send({ basicSalary: 1000000, workSystem: 'FULL_TIME', hireDate: '2024-08-15' })
      .expect(200);
    expect(edited.body.data).toMatchObject({
      basicSalary: 1000000,
      workSystem: 'FULL_TIME',
      hireDate: '2024-08-15',
    });
    expect(emitSpy).toHaveBeenCalledWith(HrEvent.EMPLOYEE_UPDATED, {
      employeeId: e.id,
      at: expect.any(String),
    });

    const list = await http(app).get(`/hr/employees?departmentId=${dept.id}`).expect(200);
    const row = (list.body.data as { id: string }[]).find((r) => r.id === e.id);
    expect(row).toEqual({
      id: e.id,
      code: e.code,
      nameEn: 'Sara Ali',
      nameAr: 'سارة علي',
      department: { id: dept.id, nameEn: 'Science', nameAr: 'العلوم' },
      stage: { id: stageId, nameEn: 'Primary', nameAr: 'ابتدائي' },
      jobTitle: { id: title.id, nameEn: 'Lab tech', nameAr: 'فني معمل' },
      workSystem: 'FULL_TIME',
      basicSalary: 1000000,
      status: 'ACTIVE',
      photoUrl: null,
      gender: 'FEMALE',
    });

    await http(app).post(`/hr/employees/${e.id}/deactivate`).expect(200);
    const back = await http(app).post(`/hr/employees/${e.id}/reactivate`).expect(200);
    expect(back.body.data).toMatchObject({ code: e.code, status: 'ACTIVE', basicSalary: 1000000 });
  });
});
