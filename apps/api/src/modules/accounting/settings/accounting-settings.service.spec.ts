import type { TransactionHost } from '@nestjs-cls/transactional';
import { DEFAULT_TAX_RULE, SETTING_DEFAULTS, type TaxRule } from '@school-erp/shared';
import type { SettingsService } from '../../../core/settings';
import type { DbAdapter } from '../../../database/transactions';
import { AccountingSettingsService } from './accounting-settings.service';
import { BASELINE_EFFECTIVE_FROM, type AccountingTaxRuleRepository } from './accounting-tax-rule.repository';

/**
 * Core's SettingsService, faked: `getValues` fills defaults like the real one. The tax rule's
 * history is an in-memory list with the repository's "in force at" lookup.
 */
function makeService(
  rows: Array<{ key: string; value: unknown }> = [],
  versions: Array<{ rule: TaxRule; effectiveFrom: Date; changedById: string | null }> = [],
) {
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const settings = {
    getValues: jest.fn((keys: string[]) =>
      Promise.resolve(
        Object.fromEntries(
          keys.map((k) => [k, stored.has(k) ? stored.get(k) : SETTING_DEFAULTS[k as keyof typeof SETTING_DEFAULTS]]),
        ),
      ),
    ),
    setValues: jest.fn(() => Promise.resolve([])),
  };
  const taxRules = {
    add: jest.fn((rule: TaxRule, effectiveFrom: Date, changedById: string | null) => {
      versions.push({ rule, effectiveFrom, changedById });
      return Promise.resolve();
    }),
    inForceAt: jest.fn((at: Date) => {
      const inForce = versions
        .filter((v) => v.effectiveFrom <= at)
        .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
      return Promise.resolve(inForce?.rule ?? null);
    }),
    isEmpty: jest.fn(() => Promise.resolve(versions.length === 0)),
  };
  const txHost = { withTransaction: jest.fn((fn: () => Promise<unknown>) => fn()) };
  const service = new AccountingSettingsService(
    settings as unknown as SettingsService,
    taxRules as unknown as AccountingTaxRuleRepository,
    txHost as unknown as TransactionHost<DbAdapter>,
  );
  return { service, settings, taxRules, versions, txHost };
}

const rule = (insurancePercent: number): TaxRule => ({ ...DEFAULT_TAX_RULE, insurancePercent });

describe('AccountingSettingsService', () => {
  it('returns the §10 defaults (the previous HR system: 6 monthly slices to 25%, fund 0.05%, insurance 11%)', async () => {
    const { service } = makeService();
    await expect(service.get()).resolves.toEqual({
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
    });
    // No version kept yet: the rule has never changed, so today's (the defaults) is in force.
    await expect(service.taxRuleAt(new Date())).resolves.toEqual(DEFAULT_TAX_RULE);
  });

  it('a new slice table replaces the old one; only the changed keys go to core, scope accounting', async () => {
    const { service, settings } = makeService();
    const brackets = [
      { width: 300_000, percent: 0 },
      { width: null, percent: 10 },
    ];
    const res = await service.update({ payroll: { brackets, martyrPercent: 0.1 } }, 'u1');
    expect(res.payroll).toEqual({ brackets, martyrPercent: 0.1, insurancePercent: 11 });
    expect(settings.setValues).toHaveBeenCalledWith(
      'accounting',
      { 'accounting.payroll.taxBrackets': brackets, 'accounting.payroll.martyrPercent': 0.1 },
      'u1',
    );
  });

  it('a value equal to the current one writes nothing (core still answers @Audited), and keeps no version', async () => {
    const { service, settings, taxRules } = makeService();
    await service.update({ payroll: { insurancePercent: 11 } }, 'u1');
    expect(settings.setValues).toHaveBeenCalledWith('accounting', {}, 'u1');
    expect(taxRules.add).not.toHaveBeenCalled();
  });

  it('a change is kept as a version, in the same transaction; the first one also keeps the rule before it as the baseline', async () => {
    const { service, versions, txHost } = makeService();
    const before = Date.now();
    await service.update({ payroll: { insurancePercent: 12 } }, 'u1');
    expect(txHost.withTransaction).toHaveBeenCalledTimes(1);
    expect(versions).toEqual([
      { rule: DEFAULT_TAX_RULE, effectiveFrom: BASELINE_EFFECTIVE_FROM, changedById: null },
      { rule: rule(12), effectiveFrom: expect.any(Date), changedById: 'u1' },
    ]);
    expect(versions[1].effectiveFrom.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('a later change adds one version, no second baseline', async () => {
    const { service, versions } = makeService(
      [{ key: 'accounting.payroll.insurancePercent', value: 12 }],
      [
        { rule: DEFAULT_TAX_RULE, effectiveFrom: BASELINE_EFFECTIVE_FROM, changedById: null },
        { rule: rule(12), effectiveFrom: new Date('2026-10-01T00:00:00Z'), changedById: 'u1' },
      ],
    );
    await service.update({ payroll: { insurancePercent: 13 } }, 'u2');
    expect(versions).toHaveLength(3);
    expect(versions[2]).toMatchObject({ rule: rule(13), changedById: 'u2' });
  });

  it('taxRuleAt: the version in force at that moment, not today\'s rule', async () => {
    const { service } = makeService(
      [{ key: 'accounting.payroll.insurancePercent', value: 13 }],
      [
        { rule: DEFAULT_TAX_RULE, effectiveFrom: BASELINE_EFFECTIVE_FROM, changedById: null },
        { rule: rule(12), effectiveFrom: new Date('2026-10-01T00:00:00Z'), changedById: 'u1' },
        { rule: rule(13), effectiveFrom: new Date('2026-11-10T00:00:00Z'), changedById: 'u1' },
      ],
    );
    await expect(service.taxRuleAt(new Date('2026-09-30T23:59:59Z'))).resolves.toEqual(DEFAULT_TAX_RULE);
    await expect(service.taxRuleAt(new Date('2026-10-01T00:00:00Z'))).resolves.toEqual(rule(12));
    await expect(service.taxRuleAt(new Date('2026-11-01T09:00:00Z'))).resolves.toEqual(rule(12));
    await expect(service.taxRuleAt(new Date('2026-11-18T09:00:00Z'))).resolves.toEqual(rule(13));
  });

  it.each([
    ['an open-ended slice that is not last', [{ width: null, percent: 0 }, { width: 100, percent: 10 }], 0.05],
    ['a last slice with a width', [{ width: 100, percent: 10 }], 0.05],
    ['a slice rate plus the fund reaching 100', [{ width: null, percent: 99.99 }], 0.05],
  ])('%s → 400 INVALID_TAX_RULE, nothing written', async (_name, brackets, martyrPercent) => {
    const { service, settings, taxRules } = makeService();
    await expect(
      service.update({ payroll: { brackets, martyrPercent } }, 'u1'),
    ).rejects.toMatchObject({ code: 'INVALID_TAX_RULE' });
    expect(settings.setValues).not.toHaveBeenCalled();
    expect(taxRules.add).not.toHaveBeenCalled();
  });
});
