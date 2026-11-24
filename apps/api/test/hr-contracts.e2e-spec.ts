import type { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, ErrorCode, type AuthUser, type Contract, type ContractsPage, type UserAccount } from '@school-erp/shared';
import { JobRunner } from '../src/core/jobs';
import { DatabaseService } from '../src/database/database.service';
import { ContractsService } from '../src/modules/hr/contracts/services/contracts.service';
import { HR_REMINDERS_JOB, HrRemindersJob } from '../src/modules/hr/reminders/hr-reminders.job';
import { http, unique } from './helpers';
import { ANONYMOUS_HEADER, createAppAsTestUser, giveRoles } from './helpers/as-test-user';
import { historyMark } from './helpers/history';
import { deleteEmployees } from './helpers/employees';

/*
 * Contracts (spec docs/specs/2026-11-24-contracts.md) through the API: the renewal list, every
 * decision, the school calendar, the documents and who may do what (§2). Employees are created
 * through the API (they get their first contract there); dates are years ahead so this suite's
 * contracts are the only ones in their contract years. The school's today is fixed to the first day
 * of those contracts (`ContractsService.today`), so they are in force: decisions are taken only on a
 * contract that has started (bug 2026-11-24, `CONTRACT_NOT_STARTED`).
 */

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const TEMPORARY = 'a-temporary-password-1';
const OWN = 'my-own-password-123';

/** `name=value; …` for the session cookies a response set. */
function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return list
    .map((c) => c.split(';')[0] ?? '')
    .filter((pair) => pair.startsWith(`${AUTH_COOKIES.access}=`) || pair.startsWith(`${AUTH_COOKIES.refresh}=`))
    .join('; ');
}
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
    jest.spyOn(app.get(ContractsService), 'today').mockReturnValue(`${YEAR}-06-01`);
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
    const emails = (await db.user.findMany({ where: { id: { in: users } }, select: { email: true } })).map((u) => u.email);
    await db.loginAttempt.deleteMany({ where: { email: { in: emails } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    // Contracts first, then the employees (test cleanup only; neither is ever deleted in the app).
    await deleteEmployees(db, { where: { id: { in: employees } } });
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
      expect(history.map((h) => [h.startsOn, h.status, h.phase])).toEqual([
        [`${YEAR + 1}-06-01`, 'ACTIVE', 'UPCOMING'],
        [`${YEAR}-06-01`, 'RENEWED', 'CURRENT'],
      ]);
      // Bug 2026-11-24: the record keeps naming the contract in force until the next one starts.
      const emp = (await http(app).get(`/hr/employees/${id}`).expect(200)).body.data;
      expect([emp.contractStart, emp.contractEnd]).toEqual([`${YEAR}-06-01`, `${YEAR + 1}-05-31`]);
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
      // The current season (today is fixed inside it) also lists earlier years' open rows.
      expect(page.totals.ending + page.totals.carriedOver).toBe(page.total);
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

  /**
   * A real session for `roleKeys` (files are opened with the session cookie: `/files/…` is checked
   * by the real auth before any guard, so the test user's stand-in can't open them).
   */
  async function readerSession(roleKeys: string[], employeeId: string | null = null): Promise<string> {
    const roleIds = (await db.role.findMany({ where: { key: { in: roleKeys } }, select: { id: true } })).map((r) => r.id);
    const email = `${unique('contracts')}@school.test`.toLowerCase();
    const u = (await http(app).post('/users').send({ name: unique('Reader'), email, password: TEMPORARY, roleIds, employeeId }).expect(201))
      .body.data as UserAccount;
    users.push(u.id);
    const first = await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: TEMPORARY }).expect(200);
    await http(app).post('/account/password').set(ANONYMOUS_HEADER, '1').set('Cookie', sessionCookie(first)).send({ newPassword: OWN }).expect(204);
    return sessionCookie(await http(app).post('/auth/login').set(ANONYMOUS_HEADER, '1').send({ email, password: OWN }).expect(200));
  }
  const open = (cookie: string, url: string) => http(app).get(url).set(ANONYMOUS_HEADER, '1').set('Cookie', cookie);

  describe('documents (a sensitive folder)', () => {
    it('a letter opens only once attached, for whoever may see the contract; each opening is recorded', async () => {
      const officer = await readerSession(['hr_officer']);
      const accountant = await readerSession(['accountant']);
      const c = await currentOf(await employee());
      const up = await http(app)
        .post(`/hr/contracts/${c.id}/files`)
        .attach('file', PDF, { filename: 'letter.pdf', contentType: 'application/pdf' })
        .expect(200);
      const url = up.body.data.fileUrl as string;
      expect(url).toMatch(new RegExp(`^/files/contract-documents/${c.id}-.+\\.pdf$`));
      // Unattached: nobody's.
      await open(officer, url).expect(404);
      await http(app)
        .post(`/hr/contracts/${c.id}/not-renewed`)
        .send({ by: 'EMPLOYEE', receivedOn: '2026-01-10', fileUrl: url })
        .expect(200);
      const opened = await open(officer, url).expect(200);
      expect(opened.headers['content-type']).toContain('application/pdf');
      // Without the view permission it doesn't exist; signed out → 401.
      await open(accountant, url).expect(404);
      await http(app).get(url).set(ANONYMOUS_HEADER, '1').expect(401);
      expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.document_open', entityId: c.id } })).toBe(1);
      // A renamed file is refused by its bytes.
      await http(app)
        .post(`/hr/contracts/${c.id}/files`)
        .attach('file', Buffer.from('<html></html>'), { filename: 'x.pdf', contentType: 'application/pdf' })
        .expect(400);
    });
  });

  describe('review fixes (2026-11-24)', () => {
    it('review 2 — a renewed contract can be ended (Article 148 in April): the next one is cancelled, kept, off the screen', async () => {
      const id = await employee();
      const c = await currentOf(id);
      await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(200);
      const res = await http(app)
        .post(`/hr/contracts/${c.id}/end`)
        .send({ reason: 'ARTICLE_148', endsOn: `${YEAR + 1}-04-15`, note: 'Article 148' })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'ENDED_EARLY', endedOn: `${YEAR + 1}-04-15`, next: null });
      expect((await contractsOf(id)).map((h) => [h.startsOn, h.status])).toEqual([
        [`${YEAR + 1}-06-01`, 'CANCELLED'],
        [`${YEAR}-06-01`, 'ENDED_EARLY'],
      ]);
      const emp = (await http(app).get(`/hr/employees/${id}`).expect(200)).body.data;
      expect([emp.contractStart, emp.contractEnd]).toEqual([`${YEAR}-06-01`, `${YEAR + 1}-04-15`]);
      const nextYear = (await http(app).get(`/hr/contracts?year=${YEAR + 1}&search=${c.employee.code}`).expect(200)).body.data as ContractsPage;
      expect(nextYear.items).toEqual([]);
      const actions = await db.auditEntry.findMany({
        where: { seq: { gt: mark }, entityType: 'employee_contract', action: { in: ['hr.contract.cancel', 'hr.contract.end'] }, entityLabel: c.employee.nameEn },
        select: { action: true },
      });
      expect(actions.map((a) => a.action).sort()).toEqual(['hr.contract.cancel', 'hr.contract.end']);
    });

    it('review 3 — the school changes its mind: its not-renewing is undone (with a reason), then active again', async () => {
      const c = await currentOf(await employee());
      await http(app).post(`/hr/contracts/${c.id}/not-renewed`).send({ by: 'SCHOOL', note: 'Budget' }).expect(200);
      expect((await currentOf(c.employee.id)).note).toBe('Budget');
      await http(app).post(`/hr/contracts/${c.id}/not-renewed/undo`).send({ reason: '' }).expect(400);
      const res = await http(app).post(`/hr/contracts/${c.id}/not-renewed/undo`).send({ reason: 'Budget found' }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'ACTIVE', decision: 'UNDECIDED' });
      expect(await db.auditEntry.count({ where: { seq: { gt: mark }, action: 'hr.contract.not_renew_undo', entityId: c.id } })).toBe(1);
    });

    it('review 3 — a reactivated employee gets a new contract (no overlap, never while one is active)', async () => {
      const id = await employee();
      const c = await currentOf(id);
      await http(app).post(`/hr/employees/${id}/contracts`).send({}).expect(409);
      await http(app).post(`/hr/contracts/${c.id}/end`).send({ reason: 'OTHER', endsOn: `${YEAR}-12-31`, note: 'Left' }).expect(200);
      await http(app).post(`/hr/employees/${id}/deactivate`).expect(200);
      await http(app).post(`/hr/employees/${id}/reactivate`).expect(200);
      const overlap = await http(app).post(`/hr/employees/${id}/contracts`).send({ startsOn: `${YEAR}-12-31` }).expect(409);
      expect(overlap.body.error).toBe(ErrorCode.CONTRACT_OVERLAP);
      const made = await http(app).post(`/hr/employees/${id}/contracts`).send({ startsOn: `${YEAR + 1}-02-01` }).expect(201);
      expect(made.body.data).toMatchObject({ startsOn: `${YEAR + 1}-02-01`, endsOn: `${YEAR + 2}-01-31`, status: 'ACTIVE' });
      expect(made.body.data.phase).toBe('UPCOMING');
      // It starts later: the record keeps naming the last contract until then (bug 2026-11-24).
      const emp = (await http(app).get(`/hr/employees/${id}`).expect(200)).body.data;
      expect([emp.contractStart, emp.contractEnd]).toEqual([`${YEAR}-06-01`, `${YEAR}-12-31`]);
    });

    it('review 7 — contracts are kept forever: an employee with contracts can’t be deleted', async () => {
      const id = await employee();
      await expect(db.employee.delete({ where: { id } })).rejects.toThrow();
    });
  });

  /*
   * Bug 2026-11-24 (owner, testing): 2026/27 renewed in November made 2027/28 "Current", decidable,
   * and the employee's dates moved to it at once. One employee walked through time, the school's
   * today moving forward.
   */
  describe('one employee over time — Current vs Upcoming (bug 2026-11-24)', () => {
    const contracts = () => app.get(ContractsService);
    const runJobOn = (day: string) => {
      jest.spyOn(app.get(HrRemindersJob), 'now').mockReturnValue(new Date(`${day}T05:00:00Z`));
      return app.get(JobRunner).run(HR_REMINDERS_JOB);
    };
    afterEach(() => jest.spyOn(contracts(), 'today').mockReturnValue(`${YEAR}-06-01`));

    it('renewed in November: the next contract is UPCOMING and refused CONTRACT_NOT_STARTED; on its first day it is CURRENT and the record moves', async () => {
      const id = await employee();
      const c = await currentOf(id);
      jest.spyOn(contracts(), 'today').mockReturnValue(`${YEAR}-11-24`);
      await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(200);
      const [next, inForce] = await contractsOf(id);
      expect(inForce).toMatchObject({ id: c.id, phase: 'CURRENT', status: 'RENEWED' });
      expect(next).toMatchObject({ phase: 'UPCOMING', startsOn: `${YEAR + 1}-06-01`, year: YEAR + 1 });

      // No decision on a contract that hasn't started: renew, not renew, a notice, an early termination.
      const renew = await http(app).post('/hr/contracts/renew').send({ contractIds: [next.id] }).expect(409);
      expect(renew.body.error).toBe(ErrorCode.CONTRACT_NOT_STARTED);
      const notRenew = await http(app).post(`/hr/contracts/${next.id}/not-renewed`).send({ by: 'SCHOOL' }).expect(409);
      expect(notRenew.body.error).toBe(ErrorCode.CONTRACT_NOT_STARTED);
      const notice = await http(app).post(`/hr/contracts/${next.id}/not-renewed`).send({ by: 'EMPLOYEE', receivedOn: `${YEAR}-11-24` }).expect(409);
      expect(notice.body.error).toBe(ErrorCode.CONTRACT_NOT_STARTED);
      const early = await http(app).post(`/hr/contracts/${next.id}/early-termination`).send({ requestedOn: `${YEAR}-11-24` }).expect(409);
      expect(early.body.error).toBe(ErrorCode.CONTRACT_NOT_STARTED);
      // In a bulk renewal it is a refused row; nothing is renewed.
      const other = await currentOf(await employee());
      const bulk = await http(app).post('/hr/contracts/renew').send({ contractIds: [other.id, next.id] }).expect(409);
      expect(bulk.body).toMatchObject({
        error: ErrorCode.CONTRACTS_NOT_RENEWABLE,
        data: [{ contractId: next.id, code: ErrorCode.CONTRACT_NOT_STARTED }],
      });
      expect((await currentOf(other.employee.id)).status).toBe('ACTIVE');

      // The record still names the contract in force; the daily job on 31 May changes nothing.
      const dates = async () => {
        const emp = (await http(app).get(`/hr/employees/${id}`).expect(200)).body.data;
        return [emp.contractStart, emp.contractEnd];
      };
      expect(await dates()).toEqual([`${YEAR}-06-01`, `${YEAR + 1}-05-31`]);
      expect(await runJobOn(`${YEAR + 1}-05-31`)).toBe('success');
      expect(await dates()).toEqual([`${YEAR}-06-01`, `${YEAR + 1}-05-31`]);
      // 1 June: the next contract is in force, decidable, and the record moves to it.
      expect(await runJobOn(`${YEAR + 1}-06-01`)).toBe('success');
      expect(await dates()).toEqual([`${YEAR + 1}-06-01`, `${YEAR + 2}-05-31`]);
      jest.spyOn(contracts(), 'today').mockReturnValue(`${YEAR + 1}-06-01`);
      const [now, before] = await contractsOf(id);
      expect([now.phase, before.phase]).toEqual(['CURRENT', 'PAST']);
      await http(app).post(`/hr/contracts/${now.id}/not-renewed`).send({ by: 'SCHOOL' }).expect(200);
    });

    it('the renewed contract ended before 1 June: the upcoming one is cancelled and the record stays on the ended one', async () => {
      const id = await employee();
      const c = await currentOf(id);
      jest.spyOn(contracts(), 'today').mockReturnValue(`${YEAR}-11-24`);
      await http(app).post('/hr/contracts/renew').send({ contractIds: [c.id] }).expect(200);
      await http(app).post(`/hr/contracts/${c.id}/end`).send({ reason: 'DEATH', endsOn: `${YEAR + 1}-04-15`, note: 'x' }).expect(200);
      expect(await runJobOn(`${YEAR + 1}-06-01`)).toBe('success');
      const emp = (await http(app).get(`/hr/employees/${id}`).expect(200)).body.data;
      expect([emp.contractStart, emp.contractEnd]).toEqual([`${YEAR}-06-01`, `${YEAR + 1}-04-15`]);
      expect((await contractsOf(id))[0]).toMatchObject({ status: 'CANCELLED', phase: 'UPCOMING' });
    });

    it('nobody deactivates themselves through "To deactivate" (OWN_CONTRACT)', async () => {
      const self = await employee();
      const c = await currentOf(self);
      await http(app).post(`/hr/contracts/${c.id}/end`).send({ reason: 'OTHER', endsOn: `${YEAR}-11-30`, note: 'x' }).expect(200);
      jest.spyOn(contracts(), 'today').mockReturnValue(`${YEAR}-12-01`);
      const manager = await newUser('HR manager self', ['hr_manager'], self);
      const res = await as(manager, () => http(app).post('/hr/contracts/deactivate').send({ contractIds: [c.id] }).expect(403));
      expect(res.body.error).toBe(ErrorCode.OWN_CONTRACT);
      expect((await http(app).get(`/hr/employees/${self}`).expect(200)).body.data.status).toBe('ACTIVE');
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
