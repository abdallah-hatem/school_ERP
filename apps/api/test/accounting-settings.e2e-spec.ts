import { INestApplication } from '@nestjs/common';
import { ErrorCode, type AccountingSettings, type AuthUser } from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http } from './helpers';
import { createAppAsTestUser, giveRoles } from './helpers/as-test-user';

/*
 * §10 accounting: the payroll tax rule (Settings → Accounting). The test user is System admin +
 * HR manager; a second user holds a role with only `accounting.settings.view`.
 */

const ACCOUNTING_KEYS = [
  'accounting.payroll.taxBrackets',
  'accounting.payroll.martyrPercent',
  'accounting.payroll.insurancePercent',
];

const VIEW_ONLY_ROLE = 'e2e_accounting_view_only';

describe('Accounting — the payroll tax rule (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let user: AuthUser;
  let viewOnly: string;
  let roleless: string;

  const patch = (body: unknown) => http(app).patch('/accounting/settings').send(body as object);

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

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    roleless = await makeUser('e2e-accounting-roleless@example.test');
    viewOnly = await makeUser('e2e-accounting-view@example.test');
    await db.role.upsert({
      where: { key: VIEW_ONLY_ROLE },
      create: {
        key: VIEW_ONLY_ROLE,
        nameEn: 'Accounting viewer',
        nameAr: 'مطّلع على المحاسبة',
        permissions: { create: [{ permissionKey: 'accounting.settings.view', scope: 'all' }] },
      },
      update: {},
    });
    await giveRoles(db, viewOnly, [VIEW_ONLY_ROLE]);
  });

  afterEach(async () => {
    // Back to the defaults, with no history: a version left behind would stay "in force".
    await db.schoolSetting.deleteMany({ where: { key: { in: ACCOUNTING_KEYS } } });
    await db.accountingTaxRuleVersion.deleteMany({});
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [roleless, viewOnly] } } });
    await db.role.deleteMany({ where: { key: VIEW_ONLY_ROLE } });
    await app.close();
  });

  it('Fresh database: the tax rule is the previous HR system’s (6 monthly slices to 25%, fund 0.05%, insurance 11%)', async () => {
    const res = await http(app).get('/accounting/settings').expect(200);
    expect(res.body.data).toEqual({
      payroll: {
        brackets: [
          { width: 500_000, percent: 0 },
          { width: 125_000, percent: 10 },
          { width: 125_000, percent: 15 },
          { width: 1_083_333, percent: 20 },
          { width: 1_666_667, percent: 22.5 },
          { width: null, percent: 25 },
        ],
        martyrPercent: 0.05,
        insurancePercent: 11,
      },
    } satisfies AccountingSettings);
  });

  it('PATCH saves the tax rule, records it in the audit log (accounting module), and GET shows it', async () => {
    const payroll = {
      brackets: [
        { width: 300_000, percent: 0 },
        { width: null, percent: 12.5 },
      ],
      martyrPercent: 0.1,
      insurancePercent: 11.25,
    };
    await patch({ payroll }).expect(200);
    expect((await http(app).get('/accounting/settings').expect(200)).body.data).toEqual({ payroll });
    const entry = await db.auditEntry.findFirst({
      where: { action: 'accounting.settings.update' },
      orderBy: { seq: 'desc' },
    });
    expect(entry).toMatchObject({ module: 'accounting', entityType: 'accounting_settings', actorId: user.id });
    // Kept as a version (§10), after the baseline it replaced (the defaults).
    const versions = await db.accountingTaxRuleVersion.findMany({ orderBy: { effectiveFrom: 'asc' } });
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ effectiveFrom: new Date('1970-01-01T00:00:00.000Z'), changedById: null });
    expect(versions[1]).toMatchObject({ rule: payroll, changedById: user.id });
    // Saving the same rule again keeps no new version.
    await patch({ payroll }).expect(200);
    expect(await db.accountingTaxRuleVersion.count()).toBe(2);
  });

  describe('a bad tax table is refused → 400, nothing saved', () => {
    it.each([
      // the whole rule (INVALID_TAX_RULE)
      ['an open-ended slice in the middle (a band with no top)', { payroll: { brackets: [{ width: null, percent: 0 }, { width: 100, percent: 10 }] } }, ErrorCode.INVALID_TAX_RULE],
      ['a last slice with a width (no "rest")', { payroll: { brackets: [{ width: 100, percent: 10 }] } }, ErrorCode.INVALID_TAX_RULE],
      ['a slice rate plus the fund at exactly 100%', { payroll: { brackets: [{ width: null, percent: 99.95 }], martyrPercent: 0.05 } }, ErrorCode.INVALID_TAX_RULE],
      ['a slice rate plus the fund above 100%', { payroll: { brackets: [{ width: null, percent: 99.99 }] } }, ErrorCode.INVALID_TAX_RULE],
      // the shape (VALIDATION_FAILED)
      ['an unknown top-level key', { tax: { rate: 10 } }, ErrorCode.VALIDATION_FAILED],
      ['an unknown payroll key', { payroll: { rate: 10 } }, ErrorCode.VALIDATION_FAILED],
      ['no slices', { payroll: { brackets: [] } }, ErrorCode.VALIDATION_FAILED],
      ['brackets not a list', { payroll: { brackets: 'all' } }, ErrorCode.VALIDATION_FAILED],
      ['a width of 0', { payroll: { brackets: [{ width: 0, percent: 0 }, { width: null, percent: 10 }] } }, ErrorCode.VALIDATION_FAILED],
      ['a width with piastre fractions', { payroll: { brackets: [{ width: 1.5, percent: 0 }, { width: null, percent: 10 }] } }, ErrorCode.VALIDATION_FAILED],
      ['a rate of 100', { payroll: { brackets: [{ width: null, percent: 100 }] } }, ErrorCode.VALIDATION_FAILED],
      ['a rate with 3 decimals', { payroll: { brackets: [{ width: null, percent: 10.125 }] } }, ErrorCode.VALIDATION_FAILED],
      ['a rate as text', { payroll: { martyrPercent: '0.05' } }, ErrorCode.VALIDATION_FAILED],
      ['11 slices', { payroll: { brackets: [...Array.from({ length: 10 }, () => ({ width: 100, percent: 0 })), { width: null, percent: 0 }] } }, ErrorCode.VALIDATION_FAILED],
      ['a negative fund', { payroll: { martyrPercent: -0.05 } }, ErrorCode.VALIDATION_FAILED],
      ['an insurance share of 100', { payroll: { insurancePercent: 100 } }, ErrorCode.VALIDATION_FAILED],
    ])('%s → %s', async (_label, body, code) => {
      const res = await patch(body).expect(400);
      expect(res.body.error).toBe(code);
      expect(await db.schoolSetting.count({ where: { key: { in: ACCOUNTING_KEYS } } })).toBe(0);
    });
  });

  it('a role with accounting.settings.view but not .edit reads the rule but is refused when changing it (403), nothing saved', async () => {
    await as(viewOnly, async () => {
      await http(app).get('/accounting/settings').expect(200);
      await patch({ payroll: { martyrPercent: 0.1 } }).expect(403);
    });
    expect(await db.schoolSetting.count({ where: { key: { in: ACCOUNTING_KEYS } } })).toBe(0);
  });

  it('a user without accounting keys is refused reading and changing (403)', async () => {
    await as(roleless, async () => {
      await http(app).get('/accounting/settings').expect(403);
      await patch({ payroll: { martyrPercent: 0.1 } }).expect(403);
    });
  });
});
