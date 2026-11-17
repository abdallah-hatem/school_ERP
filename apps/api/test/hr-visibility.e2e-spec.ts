import { INestApplication } from '@nestjs/common';
import {
  BuiltInRole,
  EMPLOYEE_SALARY_FIELDS,
  PAYROLL_LINE_MONEY_FIELDS,
  type AuditEntry,
  type AuthUser,
  type CreateEmployeeRequest,
  type Employee,
  type EmployeeSummary,
  type HrDashboard,
  type LatenessMonth,
  type PayrollRun,
  type PenaltyRecord,
} from '@school-erp/shared';
import { monthOf, todayIsoDate } from '../src/common/utils/dates.util';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';

/**
 * P4 — what each role can see (spec roles-permissions R5, R7; edge cases 3 and 4). The test user
 * (HR admin) builds the data, then the requests are made as other users by swapping its id:
 *
 *   boss (KG, no manager)       ← linked to the Direct manager user
 *   head (Primary)              ← linked to the Stage head user
 *   p1   (Primary, boss's team)
 *   k1   (KG, boss's team)
 *   k2   (KG, nobody's team)    ← linked to the "self" user (a custom role, scope self)
 *
 * Stage head (own_stage, Primary): head, p1.   Direct manager (own_team of boss): p1, k1.
 * Self: k2.   Stage head with no linked employee: nobody.   HR manager: everyone, with salaries.
 */
describe('P4 — scopes and salary in HR (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  let adminId: string;

  let primary: string;
  let kg: string;
  let departmentId: string;
  let jobTitleId: string;
  let groupId: string;
  const ids = { boss: '', head: '', p1: '', k1: '', k2: '' };
  const users = { stageHead: '', directManager: '', self: '', unlinked: '', hrManager: '', principal: '' };
  let selfRoleId: string;
  let runId: string;
  const penalty: Record<string, string> = {};
  const RUN_MONTH = '2024-03';
  const today = todayIsoDate();
  const month = monthOf(today);

  const createEmployee = async (over: Partial<CreateEmployeeRequest>) =>
    (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Employee'),
          nameAr: unique('موظف'),
          gender: 'MALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2020-09-01',
          stageId: primary,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
          insuranceStatus: 'INSURED',
          insuranceNumber: String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 1e4)),
          insuranceRegistrationDate: '2021-01-01',
          insuredSalary: 800_000,
          bankName: 'Bank',
          bankAccountNumber: '12345',
          ...over,
        })
        .expect(201)
    ).body.data.id as string;

  const newUser = async (label: string, employeeId: string | null, roles: string[]) => {
    const row = await db.user.create({
      data: { email: `${unique(label)}@example.test`, name: label, passwordHash: 'x', employeeId },
      select: { id: true },
    });
    await giveRoles(db, row.id, roles);
    return row.id;
  };

  /** Runs `fn` as another user (the test user's id, swapped). */
  async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const own = user.id;
    user.id = userId;
    try {
      return await fn();
    } finally {
      user.id = own;
    }
  }

  const listIds = async () =>
    ((await http(app).get('/hr/employees').query({ limit: 100 }).expect(200)).body.data as EmployeeSummary[])
      .map((e) => e.id)
      .sort();
  const sorted = (...xs: string[]) => [...xs].sort();

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    adminId = user.id;
    db = app.get(DatabaseService);
    primary = (await db.stage.create({ data: { nameEn: unique('Primary'), nameAr: unique('ابتدائي') } })).id;
    kg = (await db.stage.create({ data: { nameEn: unique('KG'), nameAr: unique('روضة') } })).id;
    departmentId = (
      await http(app).post('/hr/departments').send({ nameEn: unique('D'), nameAr: unique('ق') }).expect(201)
    ).body.data.id;
    jobTitleId = (
      await http(app)
        .post('/hr/job-titles')
        .send({ nameEn: unique('Head'), nameAr: unique('رئيس'), managesPeople: true })
        .expect(201)
    ).body.data.id;
    groupId = (
      await http(app).post('/hr/penalty-groups').send({ nameEn: unique('G'), nameAr: unique('ج') }).expect(201)
    ).body.data.id;

    ids.boss = await createEmployee({ stageId: kg });
    ids.head = await createEmployee({ stageId: primary });
    ids.p1 = await createEmployee({ stageId: primary, managerId: ids.boss });
    ids.k1 = await createEmployee({ stageId: kg, managerId: ids.boss });
    ids.k2 = await createEmployee({ stageId: kg });

    const selfRole = await db.role.create({
      data: {
        key: unique('custom_self'),
        nameEn: 'Self',
        nameAr: 'ذاتي',
        permissions: {
          create: [
            { permissionKey: 'hr.employees.view', scope: 'self' },
            { permissionKey: 'hr.employees.view_salary', scope: 'self' },
            { permissionKey: 'hr.payroll.view', scope: 'self' },
            { permissionKey: 'hr.penalties.view', scope: 'self' },
            { permissionKey: 'hr.lateness.view', scope: 'self' },
            { permissionKey: 'hr.dashboard.view', scope: 'all' },
          ],
        },
      },
      select: { id: true, key: true },
    });
    selfRoleId = selfRole.id;

    users.stageHead = await newUser('stage-head', ids.head, [BuiltInRole.STAGE_HEAD]);
    users.directManager = await newUser('direct-manager', ids.boss, [BuiltInRole.DIRECT_MANAGER]);
    users.self = await newUser('self', ids.k2, [selfRole.key]);
    users.unlinked = await newUser('unlinked-head', null, [BuiltInRole.STAGE_HEAD]);
    users.hrManager = await newUser('hr-manager', null, [BuiltInRole.HR_MANAGER]);
    users.principal = await newUser('principal', null, [BuiltInRole.PRINCIPAL]);

    // One pending penalty per employee, this month.
    const violationId = (
      await http(app)
        .post(`/hr/penalty-groups/${groupId}/violations`)
        .send({ nameEn: unique('V'), nameAr: unique('م'), levels: [{ level: 1, action: 'NOTICE' }] })
        .expect(201)
    ).body.data.id as string;
    penalty.violationId = violationId;
    for (const [name, id] of Object.entries(ids)) {
      penalty[name] = (
        await http(app).post('/hr/penalties').send({ employeeId: id, violationId, date: today }).expect(201)
      ).body.data.id;
    }

    // An approved run of a past month (no penalties in it), for lines and payslips.
    runId = (await http(app).post('/hr/payroll-runs').send({ month: RUN_MONTH }).expect(201)).body.data.id;
    await http(app).post(`/hr/payroll-runs/${runId}/approve`).expect(200);

    // History entries about two employees: one with a salary change.
    for (const id of [ids.head, ids.k2]) {
      await db.auditEntry.create({
        data: {
          action: 'hr.employee.update',
          module: 'hr',
          entityType: 'employee',
          entityId: id,
          entityLabel: 'x',
          actorId: adminId,
          actorName: 'Admin',
          changes: [
            { field: 'phone', before: '010', after: '011' },
            { field: 'basicSalary', before: 1_000_000, after: 1_100_000 },
          ],
        },
      });
    }
  });

  afterAll(async () => {
    await db.payrollRun.deleteMany({ where: { month: RUN_MONTH } });
    await db.penaltyRecord.deleteMany({});
    await db.violationLevel.deleteMany({});
    await db.violation.deleteMany({});
    await db.penaltyGroup.deleteMany({});
    await db.latenessEntry.deleteMany({});
    await db.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await db.role.deleteMany({ where: { id: selfRoleId } });
    await db.employee.updateMany({ data: { managerId: null } });
    await db.employee.deleteMany({});
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await app.close();
  });

  // ── Scopes (R5) ─────────────────────────────────────────────────────────

  describe('own_stage (Stage head)', () => {
    it('list: only their stage’s employees', async () => {
      await asUser(users.stageHead, async () => expect(await listIds()).toEqual(sorted(ids.head, ids.p1)));
    });

    it('detail: an employee of their stage opens', async () => {
      await asUser(users.stageHead, () => http(app).get(`/hr/employees/${ids.p1}`).expect(200));
    });

    it('edge case 3 — an employee of another stage → 404', async () => {
      await asUser(users.stageHead, () => http(app).get(`/hr/employees/${ids.k1}`).expect(404));
    });

    it('penalties: only their stage’s; another stage’s record → 404', async () => {
      await asUser(users.stageHead, async () => {
        const rows = (await http(app).get('/hr/penalties').query({ limit: 100 }).expect(200)).body
          .data as PenaltyRecord[];
        expect(rows.map((r) => r.employee.id).sort()).toEqual(sorted(ids.head, ids.p1));
        await http(app).get(`/hr/penalties/${penalty.k1}`).expect(404);
        await http(app).get(`/hr/penalties/${penalty.p1}`).expect(200);
      });
    });

    it('recording a penalty for another stage’s employee → 404; their own stage → 201', async () => {
      // A violation nobody has today: the setup's one is once per day (§4) and p1 already has it.
      const violationId = (
        await http(app)
          .post(`/hr/penalty-groups/${groupId}/violations`)
          .send({ nameEn: unique('V'), nameAr: unique('م'), levels: [{ level: 1, action: 'NOTICE' }] })
          .expect(201)
      ).body.data.id as string;
      await asUser(users.stageHead, async () => {
        await http(app)
          .post('/hr/penalties')
          .send({ employeeId: ids.k2, violationId, date: today })
          .expect(404);
        const created = await http(app)
          .post('/hr/penalties')
          .send({ employeeId: ids.p1, violationId, date: today })
          .expect(201);
        await db.penaltyRecord.deleteMany({ where: { id: created.body.data.id } });
      });
    });
  });

  describe('own_team (Direct manager)', () => {
    it('list: only the employees they directly manage', async () => {
      await asUser(users.directManager, async () => expect(await listIds()).toEqual(sorted(ids.p1, ids.k1)));
    });

    it('detail inside the team → 200; edge case 3 — outside (even themselves) → 404', async () => {
      await asUser(users.directManager, async () => {
        await http(app).get(`/hr/employees/${ids.k1}`).expect(200);
        await http(app).get(`/hr/employees/${ids.k2}`).expect(404);
        await http(app).get(`/hr/employees/${ids.boss}`).expect(404);
      });
    });
  });

  describe('self (custom role)', () => {
    it('list: only their own record; any other → 404', async () => {
      await asUser(users.self, async () => {
        expect(await listIds()).toEqual([ids.k2]);
        await http(app).get(`/hr/employees/${ids.k2}`).expect(200);
        await http(app).get(`/hr/employees/${ids.k1}`).expect(404);
      });
    });

    it('payroll: only their own line, with their own salary; another payslip → 404', async () => {
      await asUser(users.self, async () => {
        const run = (await http(app).get(`/hr/payroll-runs/${runId}`).expect(200)).body.data as PayrollRun;
        expect(run.lines.map((l) => l.employeeId)).toEqual([ids.k2]);
        expect(run.lines[0]).toMatchObject({ salaryVisible: true });
        expect(run.lines[0].net).toEqual(expect.any(Number));
        expect(run.totals.employees).toBe(1);
        const other = await db.payrollLine.findFirstOrThrow({ where: { runId, employeeId: ids.k1 } });
        await http(app).get(`/hr/payroll-runs/${runId}/lines/${other.id}`).expect(404);
        await http(app).get(`/hr/employees/${ids.k1}/payroll-lines`).expect(404);
        await http(app).get(`/hr/employees/${ids.k2}/payroll-lines`).expect(200);
      });
    });

    it('lateness: only their own row', async () => {
      await asUser(users.self, async () => {
        const res = (await http(app).get('/hr/lateness').query({ month }).expect(200)).body.data as LatenessMonth;
        expect(res.rows.map((r) => r.employee.id)).toEqual([ids.k2]);
      });
    });

    it('dashboard: counts only what they see', async () => {
      await asUser(users.self, async () => {
        const dash = (await http(app).get('/hr/dashboard').expect(200)).body.data as HrDashboard;
        expect(dash.headcount?.active).toBe(1);
        expect(dash.penaltiesThisMonth?.pending).toBe(1);
      });
    });
  });

  describe('no linked employee', () => {
    it('a Stage head with no linked employee sees nobody (not everybody)', async () => {
      await asUser(users.unlinked, async () => {
        expect(await listIds()).toEqual([]);
        const rows = (await http(app).get('/hr/penalties').expect(200)).body.data as PenaltyRecord[];
        expect(rows).toEqual([]);
        await http(app).get(`/hr/employees/${ids.head}`).expect(404);
      });
    });
  });

  describe('all (HR manager)', () => {
    it('sees every employee, with salaries', async () => {
      await asUser(users.hrManager, async () => {
        expect(await listIds()).toEqual(sorted(...Object.values(ids)));
        const e = (await http(app).get(`/hr/employees/${ids.k1}`).expect(200)).body.data as Employee;
        expect(e).toMatchObject({ salaryVisible: true, basicSalary: 1_000_000, insuredSalary: 800_000, bankName: 'Bank' });
      });
    });
  });

  // ── Salary (R7) ─────────────────────────────────────────────────────────

  describe('edge case 4 — no salary fields without hr.employees.view_salary', () => {
    it('employee detail (profile) and list rows (cards): salary fields absent', async () => {
      await asUser(users.stageHead, async () => {
        const e = (await http(app).get(`/hr/employees/${ids.p1}`).expect(200)).body.data as Employee;
        expect(e.salaryVisible).toBe(false);
        for (const f of EMPLOYEE_SALARY_FIELDS) expect(e).not.toHaveProperty(f);
        const rows = (await http(app).get('/hr/employees').expect(200)).body.data as EmployeeSummary[];
        for (const r of rows) {
          expect(r.salaryVisible).toBe(false);
          expect(r).not.toHaveProperty('basicSalary');
        }
      });
    });

    it('payroll as the principal: lines without money, the school’s totals kept', async () => {
      await asUser(users.principal, async () => {
        const run = (await http(app).get(`/hr/payroll-runs/${runId}`).expect(200)).body.data as PayrollRun;
        expect(run.lines.length).toBeGreaterThanOrEqual(5);
        for (const line of run.lines) {
          expect(line.salaryVisible).toBe(false);
          for (const f of PAYROLL_LINE_MONEY_FIELDS) expect(line).not.toHaveProperty(f);
        }
        expect(run.totals.net).toEqual(expect.any(Number));
        const slip = await db.payrollLine.findFirstOrThrow({ where: { runId, employeeId: ids.p1 } });
        const payslip = (await http(app).get(`/hr/payroll-runs/${runId}/lines/${slip.id}`).expect(200)).body.data;
        expect(payslip).not.toHaveProperty('net');
        const lines = (await http(app).get(`/hr/employees/${ids.p1}/payroll-lines`).expect(200)).body.data;
        expect(lines[0]).not.toHaveProperty('net');
      });
    });

    it('…and the same reads as the HR manager carry every amount', async () => {
      await asUser(users.hrManager, async () => {
        const run = (await http(app).get(`/hr/payroll-runs/${runId}`).expect(200)).body.data as PayrollRun;
        expect(run.lines.every((l) => l.salaryVisible && typeof l.net === 'number')).toBe(true);
        const lines = (await http(app).get(`/hr/employees/${ids.p1}/payroll-lines`).expect(200)).body.data;
        expect(lines[0].net).toEqual(expect.any(Number));
      });
    });

    it('audit History: a salary change reads "changed" with no values', async () => {
      await asUser(users.principal, async () => {
        const entries = (
          await http(app).get(`/audit/records/employee/${ids.head}`).expect(200)
        ).body.data as AuditEntry[];
        const salary = entries[0].changes.find((c) => c.field === 'basicSalary');
        expect(salary).toEqual({ field: 'basicSalary', hidden: true });
        expect(entries[0].changes.find((c) => c.field === 'phone')).toMatchObject({ after: '011' });
      });
      await asUser(users.hrManager, async () => {
        const entries = (
          await http(app).get(`/audit/records/employee/${ids.head}`).expect(200)
        ).body.data as AuditEntry[];
        expect(entries[0].changes.find((c) => c.field === 'basicSalary')).toMatchObject({ after: 1_100_000 });
      });
    });
  });

  describe('Activity log scope', () => {
    let scopedAuditRole: string;
    let scopedAuditUser: string;

    beforeAll(async () => {
      const role = await db.role.create({
        data: {
          key: unique('custom_stage_audit'),
          nameEn: 'Stage audit',
          nameAr: 'سجل المرحلة',
          permissions: {
            create: [
              { permissionKey: 'core.audit.view', scope: 'all' },
              { permissionKey: 'hr.employees.view', scope: 'own_stage' },
            ],
          },
        },
        select: { id: true, key: true },
      });
      scopedAuditRole = role.id;
      // Linked to p1 (Primary, like the head): an employee has at most one account, and the
      // Stage head user already holds `head`.
      scopedAuditUser = await newUser('stage-audit', ids.p1, [role.key]);
    });

    afterAll(async () => {
      await db.user.deleteMany({ where: { id: scopedAuditUser } });
      await db.role.deleteMany({ where: { id: scopedAuditRole } });
    });

    it('edge case 3 — the History of an employee outside the scope → 404; inside → 200', async () => {
      await asUser(scopedAuditUser, async () => {
        await http(app).get(`/audit/records/employee/${ids.k2}`).expect(404);
        await http(app).get(`/audit/records/employee/${ids.head}`).expect(200);
      });
    });

    it('Activity leaves out entries about employees outside the scope', async () => {
      await asUser(scopedAuditUser, async () => {
        const entries = (
          await http(app).get('/audit').query({ module: 'hr', limit: 100 }).expect(200)
        ).body.data as AuditEntry[];
        const about = entries.filter((e) => e.entityType === 'employee').map((e) => e.entityId);
        expect(about).toContain(ids.head);
        expect(about).not.toContain(ids.k2);
      });
    });
  });

  it('the employee link has one home: employees.user_id is gone (P4 migration)', async () => {
    const columns = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'employees' AND column_name = 'user_id'`;
    expect(columns).toEqual([]);
  });
});
