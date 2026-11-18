import { INestApplication } from '@nestjs/common';
import {
  type AccountingPayrollMonth,
  type AccountingPayrollMonthSummary,
  type AuthUser,
  type CreateEmployeeRequest,
  type PayrollRun,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http, unique } from './helpers';
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

  /** The listener runs after HR's approval returns: wait until it has stored the month. */
  const recorded = async (month: string) => {
    for (let i = 0; i < 50; i += 1) {
      if (await db.accountingPayrollRun.findUnique({ where: { month } })) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`accounting never recorded ${month}`);
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
    await db.user.deleteMany({ where: { id: { in: [roleless, noSalary] } } });
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
    });
  });

  it('without accounting.payroll.view the months\' taxes are refused (403)', async () => {
    await as(roleless, async () => {
      await http(app).get('/accounting/payroll').expect(403);
      await http(app).get('/accounting/payroll/2026-11').expect(403);
    });
  });
});
