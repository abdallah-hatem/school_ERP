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
  employees: { defaultProbationMonths: 3 },
  reminders: {
    contractEndDays: 30,
    contractEndSecondDays: 7,
    probationEndDays: 7,
    latenessCheckDay: 25,
    payrollCheckDay: 28,
  },
};

describe('HrSettingsService — reminder timings (§11, N3)', () => {
  it('defaults 30 / 7 / 7 / 25 / 28; a stored one wins', async () => {
    await expect(makeService().service.reminders()).resolves.toEqual(DEFAULTS.reminders);
    const stored = makeService([{ key: 'hr.reminders.latenessCheckDay', value: 20 }]);
    await expect(stored.service.reminders()).resolves.toMatchObject({ latenessCheckDay: 20 });
  });

  it('a changed timing hands only its key to core (one hr.settings.update entry)', async () => {
    const { service, settings } = makeService();
    const result = await service.update({ reminders: { payrollCheckDay: 31 } }, 'user-1');
    expect(result.reminders.payrollCheckDay).toBe(31);
    expect(settings.setValues).toHaveBeenCalledWith('hr', { 'hr.reminders.payrollCheckDay': 31 }, 'user-1');
  });

  it('edge 15 — the second contract reminder ≥ the first → 400 INVALID_REMINDER_DAYS, nothing saved; 0 = none is fine', async () => {
    const { service, settings } = makeService();
    await expect(service.update({ reminders: { contractEndSecondDays: 30 } }, 'u')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REMINDER_DAYS',
    });
    // Checked against the stored other value: lowering the first below the stored second.
    await expect(service.update({ reminders: { contractEndDays: 7 } }, 'u')).rejects.toMatchObject({
      code: 'INVALID_REMINDER_DAYS',
    });
    expect(settings.setValues).not.toHaveBeenCalled();
    await service.update({ reminders: { contractEndDays: 5, contractEndSecondDays: 0 } }, 'u');
    expect(settings.setValues).toHaveBeenCalledWith(
      'hr',
      { 'hr.reminders.contractEndDays': 5, 'hr.reminders.contractEndSecondDays': 0 },
      'u',
    );
  });
});

describe('HrSettingsService', () => {
  it('returns the §7 defaults when nothing is stored', async () => {
    const { service } = makeService();
    await expect(service.get()).resolves.toEqual(DEFAULTS);
  });

  it('N0 — the default probation length is 3 months; a stored one wins', async () => {
    await expect(makeService().service.defaultProbationMonths()).resolves.toBe(3);
    const stored = makeService([{ key: 'hr.employees.defaultProbationMonths', value: 0 }]);
    await expect(stored.service.defaultProbationMonths()).resolves.toBe(0);
    expect((await stored.service.get()).employees).toEqual({ defaultProbationMonths: 0 });
  });

  it('N0 — changing the probation length hands only that key to core (one hr.settings.update entry)', async () => {
    const { service, settings } = makeService();
    const result = await service.update({ employees: { defaultProbationMonths: 6 } }, 'user-1');
    expect(result.employees.defaultProbationMonths).toBe(6);
    expect(settings.setValues).toHaveBeenCalledWith('hr', { 'hr.employees.defaultProbationMonths': 6 }, 'user-1');
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

  it('a value equal to the current one is not a change: core gets no keys (records nothing, still answers @Audited)', async () => {
    const { service, settings } = makeService();
    await service.update({ payroll: { dayDivisor: 30, partTime: { PART_TIME_4: 80 } } }, 'user-1');
    expect(settings.setValues).toHaveBeenCalledWith('hr', {}, 'user-1');
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
    expect(settings.setValues).toHaveBeenCalledWith('hr', {}, null);
  });

  it('passes a failed write on (core records nothing then: same transaction)', async () => {
    const { service, settings } = makeService();
    settings.setValues.mockRejectedValueOnce(new Error('db down'));
    await expect(service.update({ payroll: { dayDivisor: 26 } }, 'user-1')).rejects.toThrow(
      'db down',
    );
  });
});
