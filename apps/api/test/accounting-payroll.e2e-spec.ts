import { INestApplication } from '@nestjs/common';
import {
  type AccountingPayrollMonth,
  type AccountingPayrollMonthSummary,
  type AccountingPayrollYear,
  type AuthUser,
  type CreateEmployeeRequest,
  type PayrollRun,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { MonthLockService } from '../src/modules/hr/month-lock/month-lock.service';
import { http, unique } from './helpers';
import { outboxIdle } from './helpers/events';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';

/*
 * §10 accounting payroll taxes: worked out once when HR approves a month, from the accounting tax
 * rule in force at the approval and the insurance on HR's approved lines, then frozen — even when
 * worked out later. Expected money was worked out
 * independently with exact fractions (the gross-up, rounded half up).
 */

const ACCOUNTING_KEYS = [
  'accounting.payroll.taxBrackets',
  'accounting.payroll.martyrPercent',
  'accounting.payroll.insurancePercent',
];

/** A fresh month per test, far from the HR payroll suite's (one run per month, §6). */
let monthSeq = 0;
const usedMonths: string[] = [];
const nextMonth = () => {
  const n = monthSeq++;
  const month = `${2040 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  usedMonths.push(month);
  return month;
};

let insuranceSeq = 0;

const NO_SALARY_ROLE = 'e2e_accounting_no_salary';

describe('Accounting — payroll taxes of approved months (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let noSalary: string;
  let roleless: string;
  /** The Accountant (starting role): returns and finalizes; not an HR approver. */
  let accountant: string;

  /** Runs `fn` signed in as another user (the test user's id, swapped). */
  async function as(userId: string, fn: () => Promise<void>) {
    const id = user.id;
    user.id = userId;
    try {
      await fn();
    } finally {
      user.id = id;
    }
  }
  const makeUser = async (email: string) =>
    (
      await db.user.upsert({
        where: { email },
        create: { email, name: email, passwordHash: 'x' },
        update: {},
        select: { id: true },
      })
    ).id;
  let stageId: string;
  let departmentId: string;
  let jobTitleId: string;

  const employee = async (overrides: Partial<CreateEmployeeRequest> = {}) =>
    (
      await http(app)
        .post('/hr/employees')
        .send({
          nameEn: unique('Employee'),
          nameAr: unique('موظف'),
          gender: 'MALE',
          dateOfBirth: '1990-01-01',
          phone: '01000000000',
          hireDate: '2010-09-01',
          stageId,
          departmentId,
          jobTitleId,
          workSystem: 'FULL_TIME',
          basicSalary: 1_200_000,
          ...overrides,
        })
        .expect(201)
    ).body.data.id as string;

  const insured = (insuredSalary: number) =>
    employee({
      insuranceStatus: 'INSURED',
      insuranceNumber: `9${String(Date.now()).slice(-8)}${String(insuranceSeq++).padStart(3, '0')}`,
      insuranceRegistrationDate: '2015-01-01',
      insuredSalary,
    });

  const createRun = async (month: string) =>
    (await http(app).post('/hr/payroll-runs').send({ month }).expect(201)).body.data as PayrollRun;
  const approve = async (id: string) =>
    (await http(app).post(`/hr/payroll-runs/${id}/approve`).expect(200)).body.data as PayrollRun;

  /**
   * The listener runs in the outbox nudge, after HR's approval has returned: wait for the nudge,
   * then the month must be stored.
   */
  const recorded = async (month: string) => {
    await outboxIdle(app);
    if (!(await db.accountingPayrollRun.findUnique({ where: { month } }))) {
      throw new Error(`accounting never recorded ${month}`);
    }
  };
  const monthOf = async (month: string) =>
    (await http(app).get(`/accounting/payroll/${month}`).expect(200)).body.data as AccountingPayrollMonth;
  const lineOf = (m: AccountingPayrollMonth, employeeId: string) => {
    const line = m.lines.find((l) => l.employeeId === employeeId);
    if (!line) throw new Error(`no line for ${employeeId}`);
    return line;
  };

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    roleless = await makeUser('e2e-acc-payroll-roleless@example.test');
    // Sees the months' taxes but no salaries (a role made for this suite).
    noSalary = await makeUser('e2e-acc-payroll-nosalary@example.test');
    await db.role.upsert({
      where: { key: NO_SALARY_ROLE },
      create: {
        key: NO_SALARY_ROLE,
        nameEn: 'Payroll taxes, no salaries',
        nameAr: 'ضرائب الرواتب بلا رواتب',
        permissions: { create: [{ permissionKey: 'accounting.payroll.view', scope: 'all' }] },
      },
      update: {},
    });
    await giveRoles(db, noSalary, [NO_SALARY_ROLE]);
    accountant = await makeUser('e2e-acc-payroll-accountant@example.test');
    await giveRoles(db, accountant, ['accountant']);
    stageId = (await db.stage.create({ data: { nameEn: 'Primary', nameAr: 'ابتدائي' } })).id;
    const mk = async (path: string) =>
      (await http(app).post(path).send({ nameEn: unique('x'), nameAr: unique('س') }).expect(201)).body.data
        .id as string;
    departmentId = await mk('/hr/departments');
    jobTitleId = await mk('/hr/job-titles');
  });

  afterEach(async () => {
    // Back to the defaults, with no history: a version left behind would stay "in force".
    await db.schoolSetting.deleteMany({ where: { key: { in: ACCOUNTING_KEYS } } });
    await db.accountingTaxRuleVersion.deleteMany({});
  });

  afterAll(async () => {
    await db.accountingPayrollRun.deleteMany({ where: { month: { in: usedMonths } } });
    await db.payrollRun.deleteMany({ where: { month: { in: usedMonths } } });
    await db.employee.deleteMany({});
    await db.department.deleteMany({});
    await db.jobTitle.deleteMany({});
    await db.stage.deleteMany({});
    await db.user.deleteMany({ where: { id: { in: [roleless, noSalary, accountant] } } });
    await db.role.deleteMany({ where: { key: NO_SALARY_ROLE } });
    await app.close();
  });

  // ── payroll taxes on approval ─────────────────────────────────────────────

  it('HR approves a month → accounting works out every line: net 12,000 not insured → 1,517.32 / 6.76 / 13,524.08; insured on 5,000 → 550 / 1,517.38 / 7.04 / 14,074.42', async () => {
    const month = nextMonth();
    const plain = await employee();
    const withInsurance = await insured(500_000);
    const run = await createRun(month);
    // HR's own line carries no tax: it ends at the net.
    expect(Object.keys(run.lines[0])).not.toContain('gross');
    await approve(run.id);
    await recorded(month);

    const m = await monthOf(month);
    expect(m).toMatchObject({ month, hrRunId: run.id });
    expect(lineOf(m, plain)).toMatchObject({
      net: 1_200_000,
      insuranceStatus: 'NOT_INSURED',
      insuredSalary: null,
      insuranceAmount: 0,
      incomeTax: 151_732,
      martyrTax: 676,
      gross: 1_352_408,
    });
    const line = lineOf(m, withInsurance);
    expect(line).toMatchObject({
      net: 1_200_000,
      insuranceStatus: 'INSURED',
      insuredSalary: 500_000,
      insuranceAmount: 55_000,
      incomeTax: 151_738,
      martyrTax: 704,
      gross: 1_407_442,
    });
    expect(line.gross! - line.insuranceAmount! - line.incomeTax! - line.martyrTax!).toBe(line.net);
    for (const key of ['net', 'insuranceAmount', 'incomeTax', 'martyrTax', 'gross'] as const) {
      expect(m.totals[key]).toBe(m.lines.reduce((n, l) => n + (l[key] ?? 0), 0));
    }
    expect(m.totals.employees).toBe(m.lines.length);

    // Listed, newest month first.
    const list = (await http(app).get('/accounting/payroll').query({ limit: 100 }).expect(200)).body
      .data as AccountingPayrollMonthSummary[];
    expect(list.find((r) => r.month === month)?.totals).toEqual(m.totals);
  });

  it('frozen: changing the tax rule or the employee’s insurance after approval changes nothing; the event again records nothing twice', async () => {
    const month = nextMonth();
    const emp = await insured(500_000);
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    const before = await monthOf(month);

    await http(app)
      .patch('/accounting/settings')
      .send({ payroll: { brackets: [{ width: null, percent: 0 }], martyrPercent: 0, insurancePercent: 1 } })
      .expect(200);
    await http(app).patch(`/hr/employees/${emp}`).send({ insuredSalary: 900_000 }).expect(200);

    expect(await monthOf(month)).toEqual(before);
    expect(await db.accountingPayrollRun.count({ where: { month } })).toBe(1);
    // The audit log is append-only (it outlives earlier runs of this suite): count by this record.
    const record = await db.accountingPayrollRun.findUniqueOrThrow({ where: { month } });
    expect(
      await db.auditEntry.count({ where: { action: 'accounting.payroll.record', entityId: record.id } }),
    ).toBe(1);
  });

  it('a later month uses the rule in force at its approval, and keeps that rule', async () => {
    const month = nextMonth();
    const emp = await insured(500_000);
    await http(app)
      .patch('/accounting/settings')
      .send({ payroll: { brackets: [{ width: null, percent: 0 }], martyrPercent: 0, insurancePercent: 10 } })
      .expect(200);
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    const m = await monthOf(month);
    // No tax and no fund: gross = net + 10% of the insured salary.
    expect(lineOf(m, emp)).toMatchObject({ net: 1_200_000, insuranceAmount: 50_000, incomeTax: 0, martyrTax: 0, gross: 1_250_000 });
    expect(m.taxRule).toEqual({ brackets: [{ width: null, percent: 0 }], martyrPercent: 0, insurancePercent: 10 });
  });

  it('a DRAFT month has no taxes in accounting; an unknown month → 404; a malformed month → 400', async () => {
    const month = nextMonth();
    await employee();
    await createRun(month);
    await http(app).get(`/accounting/payroll/${month}`).expect(404);
    await http(app).get('/accounting/payroll/2099-12').expect(404);
    await http(app).get('/accounting/payroll/2026-13').expect(400);
  });

  it('payroll tables page up to 500 rows (owner, 2026-11-19); 501 → 400; other lists keep 100', async () => {
    for (const path of ['/accounting/payroll', '/hr/payroll-runs']) {
      const body = (await http(app).get(path).query({ limit: 500 }).expect(200)).body as { meta: { limit: number } };
      expect(body.meta.limit).toBe(500);
      await http(app).get(path).query({ limit: 501 }).expect(400);
    }
    await http(app).get('/hr/employees').query({ limit: 101 }).expect(400);
  });

  it('a month whose event was missed is worked out when first read', async () => {
    const month = nextMonth();
    const emp = await employee();
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    // Simulate the listener having failed: drop accounting's record and read again.
    await db.accountingPayrollRun.deleteMany({ where: { month } });
    const m = await monthOf(month);
    expect(lineOf(m, emp)).toMatchObject({ net: 1_200_000, incomeTax: 151_732, gross: 1_352_408 });
  });

  it('missed at approval and worked out later: still the rule and the insurance of the approval, not today\'s', async () => {
    const month = nextMonth();
    const emp = await insured(500_000);
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    const atApproval = await monthOf(month);
    expect(lineOf(atApproval, emp)).toMatchObject({ insuredSalary: 500_000, insuranceAmount: 55_000, gross: 1_407_442 });

    // After the approval: a new tax rule, and the employee's insured salary raised.
    await http(app)
      .patch('/accounting/settings')
      .send({ payroll: { brackets: [{ width: null, percent: 0 }], martyrPercent: 0, insurancePercent: 1 } })
      .expect(200);
    await http(app).patch(`/hr/employees/${emp}`).send({ insuredSalary: 900_000 }).expect(200);

    // The listener's record lost: the first read works the month out again.
    await db.accountingPayrollRun.deleteMany({ where: { month } });
    const later = await monthOf(month);
    expect(later.taxRule).toEqual(atApproval.taxRule);
    expect(later.lines).toEqual(atApproval.lines);
    expect(later.totals).toEqual(atApproval.totals);
  });

  // ── the year board and the Excel export ───────────────────────────────────

  it('the year board: twelve months, an approved month with its totals, a draft in HR, the rest nothing yet', async () => {
    const approved = nextMonth();
    const draft = nextMonth();
    await employee();
    const run = await createRun(approved);
    await approve(run.id);
    await recorded(approved);
    await createRun(draft);
    const full = await monthOf(approved);

    const year = Number(approved.slice(0, 4));
    const board = (await http(app).get(`/accounting/payroll/year/${year}`).expect(200)).body.data as AccountingPayrollYear;
    expect(board.year).toBe(year);
    expect(board.months).toHaveLength(12);
    expect(board.months[0]?.month).toBe(`${year}-01`);
    expect(board.months.find((m) => m.month === approved)).toMatchObject({
      state: 'APPROVED',
      summary: { month: approved, hrRunId: run.id, totals: full.totals },
    });
    if (draft.startsWith(`${year}-`)) {
      expect(board.months.find((m) => m.month === draft)).toEqual({ month: draft, state: 'DRAFT' });
    }
    // A year with no run at all.
    const empty = (await http(app).get('/accounting/payroll/year/2099').expect(200)).body.data as AccountingPayrollYear;
    expect(empty.months.every((m) => m.state === 'NONE')).toBe(true);

    await http(app).get('/accounting/payroll/year/1999').expect(400);
    await http(app).get('/accounting/payroll/year/twenty').expect(400);
  });

  it('Excel export: the month as .xlsx; an unknown month → 404', async () => {
    const month = nextMonth();
    await employee();
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    const res = await http(app).get(`/accounting/payroll/${month}/export`).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain(`payroll-taxes-${month}.xlsx`);
    await http(app).get('/accounting/payroll/2099-12/export').expect(404);
  });

  // ── return to HR / finalize (owner, 2026-11-19) ─────────────────────────────

  it('return to HR: the run is a draft again with the reason, the month leaves accounting; approved again → back, PENDING, the return cleared', async () => {
    const month = nextMonth();
    await employee();
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    expect(await monthOf(month)).toMatchObject({ status: 'PENDING', finalizedAt: null });

    await http(app).post(`/accounting/payroll/${month}/return`).send({ reason: '  Penalty missing  ' }).expect(204);
    const draft = (await http(app).get(`/hr/payroll-runs/${run.id}`).expect(200)).body.data as PayrollRun;
    expect(draft).toMatchObject({ status: 'DRAFT', approvedAt: null, transferredAt: null, returned: { reason: 'Penalty missing' } });
    await http(app).get(`/accounting/payroll/${month}`).expect(404);
    expect(await db.auditEntry.count({ where: { action: 'accounting.payroll.return' } })).toBeGreaterThan(0);

    // HR fixes and approves again: accounting works the month out again.
    const again = await approve(run.id);
    expect(again.returned).toBeNull();
    await recorded(month);
    expect(await monthOf(month)).toMatchObject({ status: 'PENDING' });
  });

  it('finalize: FINALIZED, HR\'s run transferred; it can then never be returned or finalized again (409 PAYROLL_FINALIZED)', async () => {
    const month = nextMonth();
    await employee();
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);

    const done = (await http(app).post(`/accounting/payroll/${month}/finalize`).expect(200)).body.data as AccountingPayrollMonth;
    expect(done.status).toBe('FINALIZED');
    expect(done.finalizedAt).not.toBeNull();
    const hr = (await http(app).get(`/hr/payroll-runs/${run.id}`).expect(200)).body.data as PayrollRun;
    expect(hr).toMatchObject({ status: 'APPROVED' });
    expect(hr.transferredAt).not.toBeNull();

    const back = await http(app).post(`/accounting/payroll/${month}/return`).send({ reason: 'too late' }).expect(409);
    expect(back.body.error).toBe('PAYROLL_FINALIZED');
    await http(app).post(`/accounting/payroll/${month}/finalize`).expect(409);
    expect((await monthOf(month)).status).toBe('FINALIZED');
  });

  it("return by the Accountant: audited on the month and on HR's run (actor, reason); the month unlocks; HR's approvers are told until they approve again", async () => {
    const month = nextMonth();
    await employee();
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    const locks = app.get(MonthLockService);
    expect(await locks.isMonthLocked(month)).toBe(true);
    // The audit log is append-only and outlives earlier runs of this suite: month-keyed entries
    // are read from after the last entry before this test.
    const since = (await db.auditEntry.aggregate({ _max: { seq: true } }))._max.seq ?? BigInt(0);

    await as(accountant, async () => {
      await http(app).post(`/accounting/payroll/${month}/return`).send({ reason: 'Lateness for EMP-0012 is missing.' }).expect(204);
    });

    // Accounting's entry is kept against the month (its row was dropped), with who and why.
    const accEntry = await db.auditEntry.findFirstOrThrow({
      where: { action: 'accounting.payroll.return', entityId: month, seq: { gt: since } },
    });
    expect(accEntry).toMatchObject({ entityType: 'accounting_payroll', entityLabel: month, actorId: accountant });
    expect(accEntry.changes).toEqual(
      expect.arrayContaining([
        { field: 'status', before: 'PENDING', after: 'RETURNED' },
        { field: 'reason', before: null, after: 'Lateness for EMP-0012 is missing.' },
      ]),
    );
    // HR's run carries its own entry, so the run's history shows the return.
    const hrEntry = await db.auditEntry.findFirstOrThrow({ where: { action: 'hr.payroll.returned', entityId: run.id } });
    expect(hrEntry).toMatchObject({ entityType: 'payroll_run', entityLabel: month, actorId: accountant });
    expect(hrEntry.changes).toEqual([
      { field: 'status', before: 'APPROVED', after: 'DRAFT' },
      { field: 'reason', before: null, after: 'Lateness for EMP-0012 is missing.' },
    ]);

    // The month is open again: HR can fix it (and recalculate the draft).
    expect(await locks.isMonthLocked(month)).toBe(false);
    await http(app).post(`/hr/payroll-runs/${run.id}/recalculate`).expect(200);

    // HR's approvers (the test user holds hr.payroll.approve; the Accountant doesn't) are told.
    const item = () =>
      db.notificationItem.findFirstOrThrow({
        where: { type: 'hr.payroll.returned_by_accounting', entityId: run.id, recipientId: user.id },
        orderBy: { createdAt: 'desc' },
      });
    expect(await item()).toMatchObject({ resolvedAt: null, params: { month, reason: 'Lateness for EMP-0012 is missing.' } });
    expect(
      await db.notificationItem.count({ where: { type: 'hr.payroll.returned_by_accounting', recipientId: accountant } }),
    ).toBe(0);

    // Approved again: the notice is resolved, the month locked and back in accounting.
    await approve(run.id);
    expect(await item()).toMatchObject({ resolution: 'approved' });
    expect((await item()).resolvedAt).not.toBeNull();
    expect(await locks.isMonthLocked(month)).toBe(true);
    await recorded(month);
  });

  it('a refused return (finalized month) writes no entry, on the month or on HR\'s run, and tells no one', async () => {
    const month = nextMonth();
    await employee();
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    const since = (await db.auditEntry.aggregate({ _max: { seq: true } }))._max.seq ?? BigInt(0);
    await as(accountant, async () => {
      await http(app).post(`/accounting/payroll/${month}/finalize`).expect(200);
      await http(app).post(`/accounting/payroll/${month}/return`).send({ reason: 'too late' }).expect(409);
    });
    expect(
      await db.auditEntry.count({ where: { action: 'accounting.payroll.return', entityId: month, seq: { gt: since } } }),
    ).toBe(0);
    expect(await db.auditEntry.count({ where: { action: 'hr.payroll.returned', entityId: run.id } })).toBe(0);
    expect(await db.notificationItem.count({ where: { type: 'hr.payroll.returned_by_accounting', entityId: run.id } })).toBe(0);
    // The finalize is on HR's run too.
    const transferred = await db.auditEntry.findFirstOrThrow({ where: { action: 'hr.payroll.transferred', entityId: run.id } });
    expect(transferred).toMatchObject({ entityType: 'payroll_run', actorId: accountant });
    expect(
      await db.auditEntry.count({
        where: { action: 'accounting.payroll.finalize', entityId: month, actorId: accountant, seq: { gt: since } },
      }),
    ).toBe(1);
  });

  it('return needs a reason (400); a month not in accounting → 404; without the permissions → 403', async () => {
    const month = nextMonth();
    await employee();
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    await http(app).post(`/accounting/payroll/${month}/return`).send({ reason: '   ' }).expect(400);
    await http(app).post(`/accounting/payroll/${month}/return`).send({}).expect(400);
    await http(app).post('/accounting/payroll/2099-01/return').send({ reason: 'x' }).expect(404);
    await http(app).post('/accounting/payroll/2099-01/finalize').expect(404);
    // Viewing the month is not enough.
    await as(noSalary, async () => {
      await http(app).post(`/accounting/payroll/${month}/return`).send({ reason: 'x' }).expect(403);
      await http(app).post(`/accounting/payroll/${month}/finalize`).expect(403);
    });
    expect((await monthOf(month)).status).toBe('PENDING');
  });

  // ── who sees it (§2, P4) ──────────────────────────────────────────────────

  it('salary data: a role with accounting.payroll.view but not hr.employees.view_salary sees the lines without tax, insurance, gross or net, and no money totals', async () => {
    const month = nextMonth();
    const emp = await insured(500_000);
    const run = await createRun(month);
    await approve(run.id);
    await recorded(month);
    const full = await monthOf(month);
    expect(lineOf(full, emp)).toMatchObject({ salaryVisible: true, gross: 1_407_442 });
    expect(full).toMatchObject({ salaryVisible: true, totals: { gross: full.totals.gross } });

    await as(noSalary, async () => {
      const m = (await http(app).get(`/accounting/payroll/${month}`).expect(200)).body.data as AccountingPayrollMonth;
      const line = lineOf(m, emp);
      expect(line).toMatchObject({ employeeId: emp, insuranceStatus: 'INSURED', salaryVisible: false });
      for (const field of ['net', 'insuredSalary', 'insuranceAmount', 'incomeTax', 'martyrTax', 'gross']) {
        expect(line).not.toHaveProperty(field);
      }
      expect(m.salaryVisible).toBe(false);
      expect(m.totals).toEqual({ employees: full.totals.employees });
      const list = (await http(app).get('/accounting/payroll').query({ limit: 100 }).expect(200)).body
        .data as AccountingPayrollMonthSummary[];
      expect(list.find((r) => r.month === month)?.totals).toEqual({ employees: full.totals.employees });
      const board = (await http(app).get(`/accounting/payroll/year/${month.slice(0, 4)}`).expect(200)).body
        .data as AccountingPayrollYear;
      expect(board.months.find((m) => m.month === month)?.summary?.totals).toEqual({ employees: full.totals.employees });
    });
  });

  it('without accounting.payroll.view the months\' taxes are refused (403)', async () => {
    await as(roleless, async () => {
      await http(app).get('/accounting/payroll').expect(403);
      await http(app).get('/accounting/payroll/2026-11').expect(403);
      await http(app).get('/accounting/payroll/year/2026').expect(403);
      await http(app).get('/accounting/payroll/2026-11/export').expect(403);
    });
  });
});
