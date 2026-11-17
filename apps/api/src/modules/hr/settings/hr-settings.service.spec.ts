import { SETTING_DEFAULTS } from '@school-erp/shared';
import type { SettingsService } from '../../../core/settings';
import type { UpdateHrSettingsDto } from './dto/update-hr-settings.dto';
import { HrSettingsService } from './hr-settings.service';

/** Core's SettingsService, faked: `getValues` fills defaults like the real one. */
function makeService(rows: Array<{ key: string; value: unknown }> = []) {
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const settings = {
    getValues: jest.fn((keys: string[]) =>
      Promise.resolve(
        Object.fromEntries(
          keys.map((k) => [
            k,
            stored.has(k) ? stored.get(k) : SETTING_DEFAULTS[k as keyof typeof SETTING_DEFAULTS],
          ]),
        ),
      ),
    ),
    setValues: jest.fn(() => Promise.resolve([])),
  };
  const service = new HrSettingsService(settings as unknown as SettingsService);
  return { service, settings };
}

const DEFAULTS = {
  lateness: {
    graceMinutes: 0,
    steps: [
      { hour: 1, days: 0.25 },
      { hour: 2, days: 0.5 },
    ],
    extraHourDays: 0.5,
  },
  payroll: { dayDivisor: 30, partTime: { PART_TIME_4: 80, PART_TIME_3: 60, PART_TIME_2: 40 } },
  penalties: { repetitionWindow: 'CONTRACT_YEAR' },
  // HR-system's defaults (§6/§7 GUESS): monthly brackets, fund 0.05%, insurance share 11%.
  tax: {
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
};

describe('HrSettingsService', () => {
  it('returns the §7 defaults when nothing is stored', async () => {
    const { service } = makeService();
    await expect(service.get()).resolves.toEqual(DEFAULTS);
  });

  it('stored values win over defaults; a part-time key missing from storage falls back', async () => {
    const { service } = makeService([
      { key: 'hr.payroll.dayDivisor', value: 26 },
      { key: 'hr.payroll.partTime', value: { PART_TIME_4: 75 } },
    ]);
    const s = await service.get();
    expect(s.payroll).toEqual({
      dayDivisor: 26,
      partTime: { PART_TIME_4: 75, PART_TIME_3: 60, PART_TIME_2: 40 },
    });
  });

  it('hands exactly the changed keys to core (one write, one event each), scope hr', async () => {
    const { service, settings } = makeService();
    const dto = {
      lateness: { graceMinutes: 10 },
      payroll: { dayDivisor: 26, partTime: { PART_TIME_3: 50 } },
    } as UpdateHrSettingsDto;

    const result = await service.update(dto, 'user-1');

    expect(result.lateness.graceMinutes).toBe(10);
    expect(result.payroll.partTime).toEqual({ PART_TIME_4: 80, PART_TIME_3: 50, PART_TIME_2: 40 });
    expect(settings.setValues).toHaveBeenCalledTimes(1);
    expect(settings.setValues).toHaveBeenCalledWith(
      'hr',
      {
        'hr.lateness.graceMinutes': 10,
        'hr.payroll.dayDivisor': 26,
        'hr.payroll.partTime': { PART_TIME_4: 80, PART_TIME_3: 50, PART_TIME_2: 40 },
      },
      'user-1',
    );
  });

  it('a value equal to the current one is not a change: no write row, no event', async () => {
    const { service, settings } = makeService();
    await service.update({ payroll: { dayDivisor: 30, partTime: { PART_TIME_4: 80 } } }, 'user-1');
    expect(settings.setValues).not.toHaveBeenCalled();
  });

  it('stores steps sorted by hour, and steps given in another order are not a change', async () => {
    const { service, settings } = makeService();
    const res = await service.update(
      {
        lateness: {
          steps: [
            { hour: 2, days: 0.5 },
            { hour: 1, days: 0.25 },
          ],
        },
      },
      null,
    );
    expect(res.lateness.steps).toEqual(DEFAULTS.lateness.steps);
    expect(settings.setValues).not.toHaveBeenCalled();
  });

  it('does not emit when the write fails', async () => {
    // Core emits only after its write commits (settings.service.spec); HR passes the failure on.
    const { service, settings } = makeService();
    settings.setValues.mockRejectedValueOnce(new Error('db down'));
    await expect(service.update({ payroll: { dayDivisor: 26 } }, 'user-1')).rejects.toThrow(
      'db down',
    );
  });

  it('tax: a new bracket table replaces the old one, and fund / insurance are saved as given', async () => {
    const { service, settings } = makeService();
    const brackets = [
      { width: 300_000, percent: 0 },
      { width: null, percent: 10 },
    ];
    const res = await service.update(
      { tax: { brackets, martyrPercent: 0.1 } },
      'u1',
    );
    expect(res.tax).toEqual({ brackets, martyrPercent: 0.1, insurancePercent: 11 });
    expect(settings.setValues).toHaveBeenCalledWith(
      'hr',
      { 'hr.tax.brackets': brackets, 'hr.tax.martyrPercent': 0.1 },
      'u1',
    );
  });

  it.each([
    ['an open-ended bracket that is not last', [{ width: null, percent: 0 }, { width: 100, percent: 10 }], 0.05],
    ['a last bracket with a width', [{ width: 100, percent: 10 }], 0.05],
    ['a bracket % plus the fund reaching 100', [{ width: null, percent: 99.99 }], 0.05],
  ])('tax: %s → 400 INVALID_TAX_RULE, nothing written', async (_name, brackets, martyrPercent) => {
    const { service, settings } = makeService();
    await expect(
      service.update({ tax: { brackets, martyrPercent } }, 'u1'),
    ).rejects.toMatchObject({ code: 'INVALID_TAX_RULE' });
    expect(settings.setValues).not.toHaveBeenCalled();
  });
});
