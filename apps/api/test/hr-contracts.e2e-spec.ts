import type { INestApplication } from '@nestjs/common';
import { ErrorCode, type AuthUser, type Contract, type ContractsPage } from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { historyMark } from './helpers/history';

/*
 * Contracts (spec docs/specs/2026-11-24-contracts.md) through the API: the renewal list, every
 * decision, the school calendar, the documents and who may do what (§2). Employees are created
 * through the API (they get their first contract there); dates are years ahead so this suite's
 * contracts are the only ones in their contract years.
 */

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const YEAR = 2045; // 1 Jun 2045 – 31 May 2046
const CAL = { term1Start: '2045-09-15', term1End: '2046-01-28', term2Start: '2046-02-07', nonRenewalDeadline: '2046-04-30' };

describe('Contracts (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let admin: string;
  let stageA: string;
  let stageB: string;
  let departmentId: string;
  let jobTitleId: string;
  let mark: bigint;
  const users: string[] = [];
  const employees: string[] = [];
  const months: string[] = [];

  async function as<T>(id: string, fn: () => Promise<T>): Promise<T> {
    user.id = id;
    try {
      return await fn();
    } finally {
      user.id = admin;
    }
  }

  const newUser = async (label: string, roleKeys: string[], employeeId: string | null = null) => {
    const id = (
      await db.user.create({
        data: { email: `${unique(label)}@example.test`, name: label, passwordHash: 'x', employeeId },
        select: { id: true },
      })
    ).id;
    users.push(id);
    await giveRoles(db, id, roleKeys);
    return id;
  };

  const employee = async (over: Record<string, unknown> = {}) => {
    const id = (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Contract'),
          nameAr: unique('عقد'),
          gender: 'FEMALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2015-09-01',
          stageId: stageA,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_000_000,
          contractStart: `${YEAR}-06-01`,
          contractEnd: `${YEAR + 1}-05-31`,
          ...over,
        })
        .expect(201)
    ).body.data.id as string;
    employees.push(id);
    return id;
  };

  const contractsOf = async (employeeId: string): Promise<Contract[]> =>
    (await http(app).get(`/hr/employees/${employeeId}/contracts`).expect(200)).body.data as Contract[];
  const currentOf = async (employeeId: string) => (await contractsOf(employeeId))[0];
  const list = async (query = '') =>
    (await http(app).get(`/hr/contracts?year=${YEAR}${query}`).expect(200)).body.data as ContractsPage;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    admin = user.id;
    db = app.get(DatabaseService);
    mark = await historyMark(db);
    [stageA, stageB] = [
      (await db.stage.create({ data: { nameEn: unique('Stage A'), nameAr: unique('مرحلة أ') } })).id,
      (await db.stage.create({ data: { nameEn: unique('Stage B'), nameAr: unique('مرحلة ب') } })).id,
    ];
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data.id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
    await db.schoolCalendar.deleteMany({ where: { year: { in: [YEAR, YEAR + 1] } } });
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { items: { some: { employeeId: { in: employees } } } } });
    await db.payrollRun.deleteMany({ where: { month: { in: months } } });
    await db.schoolCalendar.deleteMany({ where: { year: { in: [YEAR, YEAR + 1] } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    // Contracts go with their employees (test cleanup only; employees are never deleted in the app).
    await db.employee.deleteMany({ where: { id: { in: employees } } });
    await db.department.deleteMany({ where: { id: departmentId } });
    await db.jobTitle.deleteMany({ where: { id: jobTitleId } });
    await db.stage.deleteMany({ where: { id: { in: [stageA, stageB] } } });
    await app.close();
  });

  describe('history and the first contract', () => {
    it('a new employee gets their first contract, recorded in the audit log', async () => {
      const id = await employee();
      const [first] = await contractsOf(id);
      expect(first).toMatchObject({ startsOn: `${YEAR}-06-01`, endsOn: `${YEAR + 1}-05-31`, status: 'ACTIVE', year: YEAR });
      const entries = await db.auditEntry.findMany({
        where: { seq: { gt: mark }, entityType: 'employee_contract', entityId: first.id },
        select: { action: true, actorId: true },
      });
      expect(entries).toEqual([{ action: 'hr.contract.create', actorId: admin }]);
    });

    it('edge 13 — changing the contract dates by hand on the employee form → no longer possible (400)', async () => {
      const id = await employee();
      await http(app).patch(`/hr/employees/${id}`).send({ contractEnd: `${YEAR + 1}-08-31` }).expect(400);
      await http(app).patch(`/hr/employees/${id}`).send({ contractStart: `${YEAR}-07-01` }).expect(400);
      expect((await currentOf(id)).endsOn).toBe(`${YEAR + 1}-05-31`);
    });
  });

  describe('renewal', () => {
    it('renews: next year’s contract, the old one renewed, the history newest first, audited', async () => {
      const id = await employee();
      const c = await currentOf(id);
      const res = await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(200);
      expect(res.body.data[0]).toMatchObject({ id: c.id, status: 'RENEWED', next: { startsOn: `${YEAR + 1}-06-01`, endsOn: `${YEAR + 2}-05-31` } });
      const history = await contractsOf(id);
      expect(history.map((h) => [h.startsOn, h.status])).toEqual([
        [`${YEAR + 1}-06-01`, 'ACTIVE'],
        [`${YEAR}-06-01`, 'RENEWED'],
      ]);
      const emp = (await http(app).get(`/hr/employees/${id}`).expect(200)).body.data;
      expect([emp.contractStart, emp.contractEnd]).toEqual([`${YEAR + 1}-06-01`, `${YEAR + 2}-05-31`]);
      expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.renew', entityId: c.id } })).toBe(1);
    });

    it('edge 1 — renewing an employee who is already renewed → refused, "already renewed"', async () => {
      const id = await employee();
      const c = await currentOf(id);
      await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(200);
      const res = await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(409);
      expect(res.body.error).toBe(ErrorCode.CONTRACT_ALREADY_RENEWED);
    });

    it('edge 2 — renewing an inactive employee → refused', async () => {
      const id = await employee();
      const c = await currentOf(id);
      await http(app).post(`/hr/employees/${id}/deactivate`).expect(200);
      const res = await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(409);
      expect(res.body.error).toBe(ErrorCode.EMPLOYEE_INACTIVE);
    });

    it('edge 3 — bulk renew with one refused row → nothing is renewed; the refused rows are listed', async () => {
      const ok = await currentOf(await employee());
      const done = await currentOf(await employee());
      await http(app).post('/hr/contracts/renew').send({ contractIds: [done.id] }).expect(200);
      const res = await http(app).post('/hr/contracts/renew').send({ contractIds: [ok.id, done.id] }).expect(409);
      expect(res.body).toMatchObject({
        error: ErrorCode.CONTRACTS_NOT_RENEWABLE,
        params: { count: 1 },
        data: [{ contractId: done.id, code: ErrorCode.CONTRACT_ALREADY_RENEWED }],
      });
      expect((await contractsOf(ok.employee.id)).map((h) => h.status)).toEqual(['ACTIVE']);
    });

    it('edge 4 — two HR users renewing the same contract at once → one wins, the other gets "already renewed"', async () => {
      const id = await employee();
      const c = await currentOf(id);
      const results = await Promise.all([
        http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }),
        http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.error).toBe(ErrorCode.CONTRACT_ALREADY_RENEWED);
      expect(await contractsOf(id)).toHaveLength(2);
    });

    it('edge 5 — a contract started mid-year (1 Sep) renews 1 Sep – 31 Aug and is on the screen of the year it ends', async () => {
      const id = await employee({ contractStart: `${YEAR}-09-01`, contractEnd: `${YEAR + 1}-08-31` });
      const c = await currentOf(id);
      expect(c.year).toBe(YEAR + 1);
      const page = await list(`&search=${encodeURIComponent(c.employee.code)}`);
      expect(page.items).toEqual([]);
      const next = (await http(app).get(`/hr/contracts?year=${YEAR + 1}&search=${c.employee.code}`).expect(200)).body.data as ContractsPage;
      expect(next.items.map((i) => i.id)).toEqual([c.id]);
      await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(200);
      expect((await currentOf(id))).toMatchObject({ startsOn: `${YEAR + 1}-09-01`, endsOn: `${YEAR + 2}-08-31` });
    });
  });

  describe('the renewal list', () => {
    it('pages, filters and searches on the server, with the year’s tiles and calendar', async () => {
      const a = await employee();
      const b = await employee({ stageId: stageB });
      await http(app)
        .post(`/hr/contracts/${(await currentOf(b)).id}/not-renewed`)
        .send({ by: 'SCHOOL' })
        .expect(200);
      const page = await list('&limit=1');
      expect(page.items).toHaveLength(1);
      expect(page.total).toBeGreaterThanOrEqual(2);
      expect(page.totals.ending).toBe(page.total);
      expect(page.calendar).toBeNull();
      const byStage = await list(`&stageId=${stageB}`);
      expect(byStage.items.map((i) => i.employee.id)).toEqual([b]);
      const decided = await list(`&decision=NOT_RENEWED_SCHOOL&stageId=${stageB}`);
      expect(decided.items.map((i) => i.decision)).toEqual(['NOT_RENEWED_SCHOOL']);
      const code = (await currentOf(a)).employee.code;
      expect((await list(`&search=${code}`)).items.map((i) => i.employee.id)).toEqual([a]);
      await http(app).get(`/hr/contracts?year=${YEAR}&limit=101`).expect(400);
      await http(app).get(`/hr/contracts?year=${YEAR}&decision=MAYBE`).expect(400);
    });
  });

  describe('the school calendar, notices and early termination', () => {
    it('edge 7 — without the calendar a notice is recorded, marked "calendar not set"', async () => {
      const c = await currentOf(await employee());
      const res = await http(app)
        .post(`/hr/contracts/${c.id}/not-renewed`)
        .send({ by: 'EMPLOYEE', receivedOn: '2026-01-10' })
        .expect(200);
      expect(res.body.data.notice).toMatchObject({ timing: 'CALENDAR_NOT_SET' });
    });

    it('the calendar: inside the year and in order, else 400; audited', async () => {
      await http(app).put(`/hr/settings/school-calendar/${YEAR}`).send({ ...CAL, term2Start: '2046-01-01' }).expect(400);
      await http(app).put(`/hr/settings/school-calendar/${YEAR}`).send(CAL).expect(200);
      expect((await http(app).get(`/hr/settings/school-calendar/${YEAR}`).expect(200)).body.data).toEqual({ year: YEAR, calendar: CAL });
      expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.school_calendar.update', entityId: String(YEAR) } })).toBe(1);
    });

    it('edge 6 — a notice dated before term 2 is recorded, marked Early; withdrawn, the contract is active again', async () => {
      const c = await currentOf(await employee());
      // Received "today" — long before term 2 of 2045/46.
      const today = new Date().toISOString().slice(0, 10);
      const res = await http(app).post(`/hr/contracts/${c.id}/not-renewed`).send({ by: 'EMPLOYEE', receivedOn: today }).expect(200);
      expect(res.body.data).toMatchObject({ decision: 'NOTICE', notice: { timing: 'EARLY' } });
      const back = await http(app).post(`/hr/contracts/${c.id}/notice/withdraw`).send({ reason: 'Stays' }).expect(200);
      expect(back.body.data).toMatchObject({ status: 'ACTIVE', notice: null });
    });

    it('OPEN default — early termination outside term 1 → refused; with no request waiting there is nothing to approve', async () => {
      const c = await currentOf(await employee());
      const today = new Date().toISOString().slice(0, 10);
      const res = await http(app).post(`/hr/contracts/${c.id}/early-termination`).send({ requestedOn: today }).expect(409);
      expect(res.body.error).toBe(ErrorCode.EARLY_TERMINATION_OUTSIDE_WINDOW);
      await http(app).post(`/hr/contracts/${c.id}/early-termination/approve`).expect(409);
    });
  });

  describe('ending a contract', () => {
    it('edge 9 — an end date before a payroll month already approved → refused (the paid month stands)', async () => {
      const month = `${YEAR}-10`;
      // The approved month is a fixture of payroll's state, set directly (payroll's own suite covers approving).
      await db.payrollRun.create({ data: { month, status: 'APPROVED', approvedAt: new Date() } });
      months.push(month);
      const c = await currentOf(await employee());
      const res = await http(app)
        .post(`/hr/contracts/${c.id}/end`)
        .send({ reason: 'OTHER', endsOn: `${YEAR}-10-15`, note: 'x' })
        .expect(409);
      expect(res.body).toMatchObject({ error: ErrorCode.CONTRACT_END_MONTH_LOCKED, params: { month } });
      await http(app).post(`/hr/contracts/${c.id}/end`).send({ reason: 'OTHER', endsOn: `${YEAR}-10-31`, note: 'x' }).expect(200);
    });

    it('edge 10 — ending a contract: the employee’s contract end moves and decisions are recorded', async () => {
      const id = await employee();
      const c = await currentOf(id);
      const res = await http(app)
        .post(`/hr/contracts/${c.id}/end`)
        .send({ reason: 'RESIGNATION_BY_AGREEMENT', endsOn: `${YEAR}-12-31`, note: 'Agreed' })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'ENDED_EARLY', endedOn: `${YEAR}-12-31`, decidedBy: { id: admin } });
      expect((await http(app).get(`/hr/employees/${id}`).expect(200)).body.data.contractEnd).toBe(`${YEAR}-12-31`);
      await http(app).post(`/hr/contracts/${c.id}/end`).send({ reason: 'DEATH', endsOn: `${YEAR}-12-30`, note: 'x' }).expect(409);
    });
  });

  describe('documents (a sensitive folder)', () => {
    it('a letter opens only once attached, for whoever may see the contract; each opening is recorded', async () => {
      const c = await currentOf(await employee());
      const up = await http(app)
        .post(`/hr/contracts/${c.id}/files`)
        .attach('file', PDF, { filename: 'letter.pdf', contentType: 'application/pdf' })
        .expect(200);
      const url = up.body.data.fileUrl as string;
      expect(url).toMatch(new RegExp(`^/files/contract-documents/${c.id}-.+\\.pdf$`));
      // Unattached: nobody's.
      await http(app).get(url).expect(404);
      await http(app)
        .post(`/hr/contracts/${c.id}/not-renewed`)
        .send({ by: 'EMPLOYEE', receivedOn: '2026-01-10', fileUrl: url })
        .expect(200);
      const opened = await http(app).get(url).expect(200);
      expect(opened.headers['content-type']).toContain('application/pdf');
      expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.document_open', entityId: c.id } })).toBe(1);
      // A renamed file is refused by its bytes.
      await http(app)
        .post(`/hr/contracts/${c.id}/files`)
        .attach('file', Buffer.from('<html></html>'), { filename: 'x.pdf', contentType: 'application/pdf' })
        .expect(400);
    });
  });

  describe('who may do what (§2)', () => {
    it('edge 11 — acting on your own contract → refused (OWN_CONTRACT), a System admin too', async () => {
      const self = await employee();
      const c = await currentOf(self);
      const manager = await newUser('HR manager', ['hr_manager'], self);
      const res = await as(manager, () => http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(403));
      expect(res.body.error).toBe(ErrorCode.OWN_CONTRACT);
      const adminSelf = await employee();
      const sysAdmin = await newUser('Admin', ['system_admin'], adminSelf);
      const own = await currentOf(adminSelf);
      const res2 = await as(sysAdmin, () => http(app).post(`/hr/contracts/${own.id}/not-renewed`).send({ by: 'SCHOOL' }).expect(403));
      expect(res2.body.error).toBe(ErrorCode.OWN_CONTRACT);
    });

    it('edge 12 — a stage head sees their stage only (another stage is not found) and can’t manage (403)', async () => {
      const head = await employee({ stageId: stageA });
      const inA = await employee({ stageId: stageA });
      const inB = await employee({ stageId: stageB });
      const stageHead = await newUser('Stage head', ['stage_head'], head);
      await as(stageHead, async () => {
        const page = (await http(app).get(`/hr/contracts?year=${YEAR}&limit=100`).expect(200)).body.data as ContractsPage;
        const ids = page.items.map((i) => i.employee.id);
        expect(ids).toContain(inA);
        expect(ids).not.toContain(inB);
        await http(app).get(`/hr/employees/${inA}/contracts`).expect(200);
        await http(app).get(`/hr/employees/${inB}/contracts`).expect(404);
      });
      const c = await currentOf(inA);
      await as(stageHead, () => http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(403));
      await as(stageHead, () => http(app).post(`/hr/contracts/${c.id}/end`).send({ reason: 'OTHER', endsOn: `${YEAR}-12-31`, note: 'x' }).expect(403));
    });

    it('the HR officer views but doesn’t manage; the accountant sees nothing', async () => {
      const officer = await newUser('Officer', ['hr_officer']);
      const accountant = await newUser('Accountant', ['accountant']);
      const c = await currentOf(await employee());
      await as(officer, () => http(app).get(`/hr/contracts?year=${YEAR}`).expect(200));
      await as(officer, () => http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(403));
      await as(accountant, () => http(app).get(`/hr/contracts?year=${YEAR}`).expect(403));
      await as(accountant, () => http(app).get(`/hr/employees/${c.employee.id}/contracts`).expect(403));
    });
  });
});
