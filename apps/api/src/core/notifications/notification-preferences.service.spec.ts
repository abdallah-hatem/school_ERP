import { HttpStatus } from '@nestjs/common';
import { ErrorCode, NOTIFICATION_TYPE_KEYS, SETTING_DEFAULTS, type PermissionKey } from '@school-erp/shared';
import type { AuditService } from '../audit';
import type { PermissionsService } from '../permissions';
import type { SettingsService } from '../settings';
import { InAppChannel, NotificationChannels } from './channels';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationTypes } from './notification-types';
import type {
  NotificationPreferencesRepository,
  StoredChoice,
  StoredPersonalChoice,
} from './repositories/notification-preferences.repository';

const ME = { id: 'u-1', name: 'Mona' };
const APPROVAL = 'hr.penalty.awaiting_approval';
const REMINDER = 'hr.contract.ending_soon';

function make(
  opts: {
    held?: PermissionKey[];
    defaults?: StoredChoice[];
    choices?: StoredPersonalChoice[];
  } = {},
) {
  const repository = {
    defaults: jest.fn(() => Promise.resolve(opts.defaults ?? [])),
    setDefault: jest.fn(() => Promise.resolve()),
    choicesOf: jest.fn(() => Promise.resolve(opts.choices ?? [])),
    setChoice: jest.fn(() => Promise.resolve()),
    clearChoice: jest.fn(() => Promise.resolve()),
  };
  const permissions = {
    permissionsFor: jest.fn(() =>
      Promise.resolve(opts.held ?? ['hr.penalties.approve', 'hr.employees.edit']),
    ),
  };
  const settings = {
    getValues: jest.fn(() =>
      Promise.resolve({
        'notifications.retention.readDays': SETTING_DEFAULTS['notifications.retention.readDays'],
        'notifications.retention.resolvedDays':
          SETTING_DEFAULTS['notifications.retention.resolvedDays'],
        'notifications.retention.maxDays': SETTING_DEFAULTS['notifications.retention.maxDays'],
      }),
    ),
    setValues: jest.fn(() => Promise.resolve([])),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const service = new NotificationPreferencesService(
    repository as unknown as NotificationPreferencesRepository,
    new NotificationTypes(),
    new NotificationChannels(new InAppChannel()),
    permissions as unknown as PermissionsService,
    settings as unknown as SettingsService,
    audit as unknown as AuditService,
  );
  return { service, repository, settings, audit };
}

describe('My account → Notifications (N13)', () => {
  it('lists only the types whose permission the person holds (edge case 20); the approval locked on', async () => {
    const { service } = make({ held: ['hr.penalties.approve'] });
    const prefs = await service.preferencesOf(ME);
    expect(prefs.channels).toEqual([{ channel: 'in_app', available: true }]);
    expect(prefs.types.map((t) => t.type)).toEqual([APPROVAL]);
    expect(prefs.types[0]?.channels).toEqual([
      { channel: 'in_app', enabled: true, schoolDefault: true, personal: null, locked: true },
    ]);
  });

  it('shows the personal choice next to the school default', async () => {
    const { service } = make({
      held: ['hr.employees.edit'],
      defaults: [{ type: REMINDER, channel: 'in_app', enabled: true }],
      choices: [{ userId: ME.id, type: REMINDER, channel: 'in_app', enabled: false }],
    });
    const [contract] = (await service.preferencesOf(ME)).types;
    expect(contract?.channels[0]).toEqual({
      channel: 'in_app',
      enabled: false,
      schoolDefault: true,
      personal: false,
      locked: false,
    });
  });

  it('turning off a type that can’t be → 409 NOTIFICATION_TYPE_REQUIRED, nothing saved (edge case 17)', async () => {
    const { service, repository, audit } = make();
    await expect(
      service.updatePreferences(ME, [{ type: APPROVAL, channel: 'in_app', enabled: false }]),
    ).rejects.toMatchObject({
      code: ErrorCode.NOTIFICATION_TYPE_REQUIRED,
      status: HttpStatus.CONFLICT,
    });
    expect(repository.setChoice).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('any channel but in_app → 409 CHANNEL_NOT_AVAILABLE; an unknown type or a switch twice → 400', async () => {
    const { service } = make();
    await expect(
      service.updatePreferences(ME, [{ type: REMINDER, channel: 'email', enabled: true }]),
    ).rejects.toMatchObject({ code: ErrorCode.CHANNEL_NOT_AVAILABLE, status: HttpStatus.CONFLICT });
    await expect(
      service.updatePreferences(ME, [
        { type: 'hr.nope.nothing', channel: 'in_app', enabled: true },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, status: HttpStatus.BAD_REQUEST });
    await expect(
      service.updatePreferences(ME, [
        { type: REMINDER, channel: 'in_app', enabled: true },
        { type: REMINDER, channel: 'in_app', enabled: false },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('null deletes the personal row; the entry lists only what changed (edge cases 17, 25)', async () => {
    const { service, repository, audit } = make({
      choices: [{ userId: ME.id, type: REMINDER, channel: 'in_app', enabled: false }],
    });
    await service.updatePreferences(ME, [
      { type: REMINDER, channel: 'in_app', enabled: null },
      { type: 'hr.probation.ending_soon', channel: 'in_app', enabled: false },
      // Locked and on: changes nothing, not listed.
      { type: APPROVAL, channel: 'in_app', enabled: true },
    ]);
    expect(repository.clearChoice).toHaveBeenCalledWith(ME.id, REMINDER, 'in_app');
    expect(repository.setChoice).toHaveBeenCalledWith(ME.id, {
      type: 'hr.probation.ending_soon',
      channel: 'in_app',
      enabled: false,
    });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.notification_preferences.update',
      entity: { type: 'notification_preferences', id: ME.id, label: 'Mona' },
      changes: [
        { field: `${REMINDER}:in_app`, before: false, after: null },
        { field: 'hr.probation.ending_soon:in_app', before: null, after: false },
      ],
    });
  });

  it('an unchanged save still answers @Audited, with no changes', async () => {
    const { service, audit, repository } = make({
      choices: [{ userId: ME.id, type: REMINDER, channel: 'in_app', enabled: false }],
    });
    await service.updatePreferences(ME, [{ type: REMINDER, channel: 'in_app', enabled: false }]);
    expect(repository.setChoice).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ changes: [] }));
  });
});

describe('Settings → Notifications', () => {
  it('every type with its default (locked approvals) and the retention 90 / 30 / 365', async () => {
    const { service } = make({ defaults: [{ type: REMINDER, channel: 'in_app', enabled: false }] });
    const s = await service.settingsOf();
    expect(s.retention).toEqual({ readDays: 90, resolvedDays: 30, maxDays: 365 });
    expect(s.defaults.find((d) => d.type === APPROVAL)).toMatchObject({
      enabled: true,
      locked: true,
    });
    expect(s.defaults.find((d) => d.type === REMINDER)).toMatchObject({
      enabled: false,
      locked: false,
    });
    expect(s.defaults).toHaveLength(NOTIFICATION_TYPE_KEYS.length);
  });

  it('saves changed defaults and the retention as one entry through settings (edge case 25)', async () => {
    const { service, repository, settings } = make();
    await service.updateSettings(
      { id: 'admin' },
      {
        defaults: [
          { type: REMINDER, channel: 'in_app', enabled: false },
          // Already the default: no row, no line.
          { type: 'hr.probation.ending_soon', channel: 'in_app', enabled: true },
        ],
        retention: { readDays: 60 },
      },
    );
    expect(repository.setDefault).toHaveBeenCalledTimes(1);
    expect(repository.setDefault).toHaveBeenCalledWith(
      { type: REMINDER, channel: 'in_app', enabled: false },
      'admin',
    );
    expect(settings.setValues).toHaveBeenCalledWith(
      'notifications',
      { 'notifications.retention.readDays': 60 },
      'admin',
      [{ field: `${REMINDER}:in_app`, before: true, after: false }],
    );
  });

  it('a school default can’t be null, nor an approval switched off', async () => {
    const { service } = make();
    await expect(
      service.updateSettings(
        { id: 'admin' },
        { defaults: [{ type: REMINDER, channel: 'in_app', enabled: null }] },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    await expect(
      service.updateSettings(
        { id: 'admin' },
        { defaults: [{ type: APPROVAL, channel: 'in_app', enabled: false }] },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.NOTIFICATION_TYPE_REQUIRED });
  });
});
