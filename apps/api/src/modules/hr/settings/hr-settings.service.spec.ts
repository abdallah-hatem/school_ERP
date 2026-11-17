import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SETTING_DEFAULTS, SettingsEvent } from '@school-erp/shared';
import type { UpdateHrSettingsDto } from './dto/update-hr-settings.dto';
import { HrSettingsService } from './hr-settings.service';
import type { HrSettingsRepository, StoredSetting } from './repositories/hr-settings.repository';

function makeService(rows: StoredSetting[] = []) {
  const calls: string[] = [];
  const repository = {
    findByKeys: jest.fn().mockResolvedValue(rows),
    upsertMany: jest.fn().mockImplementation(() => {
      calls.push('write');
      return Promise.resolve();
    }),
  };
  const events = {
    emit: jest.fn().mockImplementation(() => {
      calls.push('emit');
      return true;
    }),
  };
  const service = new HrSettingsService(
    repository as unknown as HrSettingsRepository,
    events as unknown as EventEmitter2,
  );
  return { service, repository, events, calls };
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

  it('writes and emits one settings.changed per changed key, after the write', async () => {
    const { service, repository, events, calls } = makeService();
    const dto = {
      lateness: { graceMinutes: 10 },
      payroll: { dayDivisor: 26, partTime: { PART_TIME_3: 50 } },
    } as UpdateHrSettingsDto;

    const result = await service.update(dto, 'user-1');

    expect(result.lateness.graceMinutes).toBe(10);
    expect(result.payroll.partTime).toEqual({ PART_TIME_4: 80, PART_TIME_3: 50, PART_TIME_2: 40 });
    expect(repository.upsertMany).toHaveBeenCalledWith(
      [
        { key: 'hr.lateness.graceMinutes', value: 10 },
        { key: 'hr.payroll.dayDivisor', value: 26 },
        { key: 'hr.payroll.partTime', value: { PART_TIME_4: 80, PART_TIME_3: 50, PART_TIME_2: 40 } },
      ],
      'user-1',
    );
    expect(events.emit).toHaveBeenCalledTimes(3);
    expect(events.emit).toHaveBeenCalledWith(SettingsEvent.CHANGED, {
      scope: 'hr',
      key: 'hr.payroll.partTime',
      oldValue: SETTING_DEFAULTS['hr.payroll.partTime'],
      newValue: { PART_TIME_4: 80, PART_TIME_3: 50, PART_TIME_2: 40 },
      changedById: 'user-1',
      changedAt: expect.any(String) as unknown,
    });
    expect(calls).toEqual(['write', 'emit', 'emit', 'emit']);
  });

  it('a value equal to the current one is not a change: no write row, no event', async () => {
    const { service, repository, events } = makeService();
    await service.update(
      { payroll: { dayDivisor: 30, partTime: { PART_TIME_4: 80 } } },
      'user-1',
    );
    expect(repository.upsertMany).toHaveBeenCalledWith([], 'user-1');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('stores steps sorted by hour, and steps given in another order are not a change', async () => {
    const { service, events } = makeService();
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
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not emit when the write fails', async () => {
    const { service, repository, events } = makeService();
    repository.upsertMany.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.update({ payroll: { dayDivisor: 26 } }, 'user-1'),
    ).rejects.toThrow('db down');
    expect(events.emit).not.toHaveBeenCalled();
  });
});
