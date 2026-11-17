import type { SettingsChangedEvent } from '@school-erp/shared';
import type { SettingChangeRepository } from './repositories/setting-change.repository';
import { SettingsHistoryListener } from './settings-history.listener';

function makeListener(create: jest.Mock<Promise<void>> = jest.fn(() => Promise.resolve())) {
  const listener = new SettingsHistoryListener({ create } as unknown as SettingChangeRepository);
  return { listener, create };
}

const event = (over: Partial<SettingsChangedEvent> = {}): SettingsChangedEvent => ({
  scope: 'hr',
  key: 'hr.payroll.dayDivisor',
  oldValue: 30,
  newValue: 26,
  changedById: 'user-1',
  changedAt: '2026-11-17T10:00:00.000Z',
  ...over,
});

describe('SettingsHistoryListener', () => {
  it('writes one row per event, mapping the scope to the stored enum', async () => {
    const { listener, create } = makeListener();
    await listener.record(event());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      scope: 'HR',
      key: 'hr.payroll.dayDivisor',
      oldValue: 30,
      newValue: 26,
      changedById: 'user-1',
      changedAt: new Date('2026-11-17T10:00:00.000Z'),
    });
  });

  it.each(['lists', 'catalogue', 'school'] as const)('accepts the %s scope', async (scope) => {
    const { listener, create } = makeListener();
    await listener.record(event({ scope }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ scope: scope.toUpperCase() }));
  });

  it('ignores an unknown scope instead of writing a bad row', async () => {
    const { listener, create } = makeListener();
    await listener.record(event({ scope: 'payroll' as never }));
    expect(create).not.toHaveBeenCalled();
  });

  it('never throws back at the emitter when the write fails', async () => {
    const { listener } = makeListener(jest.fn(() => Promise.reject(new Error('db down'))));
    jest.spyOn(listener['logger'], 'error').mockImplementation(() => undefined);
    await expect(listener.record(event())).resolves.toBeUndefined();
  });
});
