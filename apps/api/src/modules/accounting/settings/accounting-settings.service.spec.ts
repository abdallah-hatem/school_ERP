import { DEFAULT_TAX_RULE, SETTING_DEFAULTS } from '@school-erp/shared';
import type { SettingsService } from '../../../core/settings';
import { AccountingSettingsService } from './accounting-settings.service';

/** Core's SettingsService, faked: `getValues` fills defaults like the real one. */
function makeService(rows: Array<{ key: string; value: unknown }> = []) {
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
  return { service: new AccountingSettingsService(settings as unknown as SettingsService), settings };
}

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
    await expect(service.taxRule()).resolves.toEqual(DEFAULT_TAX_RULE);
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

  it('a value equal to the current one writes nothing (core still answers @Audited)', async () => {
    const { service, settings } = makeService();
    await service.update({ payroll: { insurancePercent: 11 } }, 'u1');
    expect(settings.setValues).toHaveBeenCalledWith('accounting', {}, 'u1');
  });

  it.each([
    ['an open-ended slice that is not last', [{ width: null, percent: 0 }, { width: 100, percent: 10 }], 0.05],
    ['a last slice with a width', [{ width: 100, percent: 10 }], 0.05],
    ['a slice rate plus the fund reaching 100', [{ width: null, percent: 99.99 }], 0.05],
  ])('%s → 400 INVALID_TAX_RULE, nothing written', async (_name, brackets, martyrPercent) => {
    const { service, settings } = makeService();
    await expect(
      service.update({ payroll: { brackets, martyrPercent } }, 'u1'),
    ).rejects.toMatchObject({ code: 'INVALID_TAX_RULE' });
    expect(settings.setValues).not.toHaveBeenCalled();
  });
});
