import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditEntityType,
  ErrorCode,
  NOTIFICATION_CHANNELS,
  NotificationSettingKey,
  type AuditChange,
  type AuthUser,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationRetention,
  type NotificationSettings,
  type NotificationTypeDefinition,
  type SettingValueMap,
} from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { AuditService } from '../audit';
import { PermissionsService } from '../permissions';
import { SettingsService } from '../settings';
import { NotificationChannels } from './channels';
import { NotificationTypes } from './notification-types';
import { effectiveEnabled, isLocked, schoolDefaultOf } from './notifications.pure';
import { NotificationPreferencesRepository } from './repositories/notification-preferences.repository';

/** One switch in a save: `enabled: null` (preferences only) goes back to the school's default. */
export interface ChoiceInput {
  type: string;
  channel: string;
  enabled: boolean | null;
}

const RETENTION_KEYS = [
  NotificationSettingKey.RETENTION_READ_DAYS,
  NotificationSettingKey.RETENTION_RESOLVED_DAYS,
  NotificationSettingKey.RETENTION_MAX_DAYS,
] as const;

/** The audit line of one switch: `<type>:<channel>`, before → after (null = the school's default). */
const changeLine = (
  type: string,
  channel: string,
  before: boolean | null,
  after: boolean | null,
): AuditChange => ({
  field: `${type}:${channel}`,
  before,
  after,
});

/**
 * Preferences (N13): per person, per type, per channel (My account → Notifications), over the
 * school's defaults (Settings → Notifications), over each type's own default. A type that can't be
 * turned off is always on in the app. Only a live channel can be chosen — `in_app` today.
 * Both saves are settings changes and are audited, listing only the switches that changed.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly repository: NotificationPreferencesRepository,
    private readonly types: NotificationTypes,
    private readonly channels: NotificationChannels,
    private readonly permissions: PermissionsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** The types the person can receive — they hold its permission — each with its channels. */
  async preferencesOf(user: Pick<AuthUser, 'id'>): Promise<NotificationPreferences> {
    const held = new Set<string>(await this.permissions.permissionsFor(user));
    const defaults = await this.defaultsMap();
    const personal = new Map(
      (await this.repository.choicesOf([user.id])).map((c) => [
        `${c.type}:${c.channel}`,
        c.enabled,
      ]),
    );
    return {
      channels: this.channels.states(),
      types: this.types
        .all()
        .filter(([, t]) => held.has(t.permission))
        .map(([key, t]) => ({
          type: key,
          module: t.module,
          category: t.category,
          canTurnOff: t.canTurnOff,
          channels: NOTIFICATION_CHANNELS.map((channel) => {
            const stored = defaults.get(`${key}:${channel}`);
            const own = isLocked(t, channel) ? null : (personal.get(`${key}:${channel}`) ?? null);
            return {
              channel,
              enabled: effectiveEnabled(t, channel, stored, own ?? undefined),
              schoolDefault: schoolDefaultOf(t, channel, stored),
              personal: own,
              locked: isLocked(t, channel),
            };
          }),
        })),
    };
  }

  /**
   * Saves the person's switches (`null` → back to the school's default) and records one
   * `core.notification_preferences.update` entry with only the changed switches.
   */
  async updatePreferences(
    user: Pick<AuthUser, 'id' | 'name'>,
    items: readonly ChoiceInput[],
  ): Promise<NotificationPreferences> {
    const checked = this.check(items, 'preferences');
    const current = new Map(
      (await this.repository.choicesOf([user.id])).map((c) => [
        `${c.type}:${c.channel}`,
        c.enabled,
      ]),
    );
    const changes: AuditChange[] = [];
    for (const { type, channel, enabled } of checked) {
      const before = current.get(`${type}:${channel}`) ?? null;
      if (before === enabled) continue;
      if (enabled === null) await this.repository.clearChoice(user.id, type, channel);
      else await this.repository.setChoice(user.id, { type, channel, enabled });
      changes.push(changeLine(type, channel, before, enabled));
    }
    await this.audit.record({
      action: 'core.notification_preferences.update',
      entity: { type: AuditEntityType.NOTIFICATION_PREFERENCES, id: user.id, label: user.name },
      changes,
    });
    return this.preferencesOf(user);
  }

  /** Settings → Notifications: the default of every type and channel, and the retention. */
  async settingsOf(): Promise<NotificationSettings> {
    const defaults = await this.defaultsMap();
    return {
      channels: this.channels.states(),
      defaults: this.types.all().flatMap(([key, t]) =>
        NOTIFICATION_CHANNELS.map((channel) => ({
          type: key,
          module: t.module,
          category: t.category,
          channel,
          enabled: schoolDefaultOf(t, channel, defaults.get(`${key}:${channel}`)),
          locked: isLocked(t, channel),
        })),
      ),
      retention: await this.retention(),
    };
  }

  /**
   * Saves the school's defaults and retention, recorded as one `core.notification_settings.update`
   * entry: the retention keys that changed and the default switches that changed.
   */
  async updateSettings(
    user: Pick<AuthUser, 'id'>,
    input: { defaults?: readonly ChoiceInput[]; retention?: Partial<NotificationRetention> },
  ): Promise<NotificationSettings> {
    const checked = this.check(input.defaults ?? [], 'defaults');
    const stored = await this.defaultsMap();
    const changes: AuditChange[] = [];
    for (const { type, channel, enabled } of checked) {
      const definition = this.types.get(type);
      const before = schoolDefaultOf(definition, channel, stored.get(`${type}:${channel}`));
      // A default is always on or off; `check` refused null here.
      const after = enabled === true;
      if (before === after) continue;
      await this.repository.setDefault({ type, channel, enabled: after }, user.id);
      changes.push(changeLine(type, channel, before, after));
    }
    const values: Partial<SettingValueMap> = {};
    const r = input.retention ?? {};
    if (r.readDays !== undefined) values['notifications.retention.readDays'] = r.readDays;
    if (r.resolvedDays !== undefined)
      values['notifications.retention.resolvedDays'] = r.resolvedDays;
    if (r.maxDays !== undefined) values['notifications.retention.maxDays'] = r.maxDays;
    await this.settings.setValues('notifications', values, user.id, changes);
    return this.settingsOf();
  }

  async retention(): Promise<NotificationRetention> {
    const v = await this.settings.getValues(RETENTION_KEYS);
    return {
      readDays: v['notifications.retention.readDays'],
      resolvedDays: v['notifications.retention.resolvedDays'],
      maxDays: v['notifications.retention.maxDays'],
    };
  }

  /**
   * Refuses the whole save on the first bad switch: an unknown type or the same switch twice (400),
   * a channel that isn't live (409 `CHANNEL_NOT_AVAILABLE`), turning off a type that can't be
   * (409 `NOTIFICATION_TYPE_REQUIRED`); a school default can't be `null` (400). A locked switch
   * sent as on (or back to the default) changes nothing and is left out.
   */
  private check(
    items: readonly ChoiceInput[],
    what: 'preferences' | 'defaults',
  ): (ChoiceInput & { channel: NotificationChannel })[] {
    const seen = new Set<string>();
    return items.flatMap((item) => {
      const type: NotificationTypeDefinition | undefined = this.types.find(item.type);
      if (
        !type ||
        seen.has(`${item.type}:${item.channel}`) ||
        (what === 'defaults' && item.enabled === null)
      ) {
        throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED);
      }
      seen.add(`${item.type}:${item.channel}`);
      if (!this.channels.isAvailable(item.channel)) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.CHANNEL_NOT_AVAILABLE);
      }
      if (isLocked(type, item.channel)) {
        if (item.enabled === false)
          throw new CodedException(HttpStatus.CONFLICT, ErrorCode.NOTIFICATION_TYPE_REQUIRED);
        return [];
      }
      return [{ ...item, channel: item.channel }];
    });
  }

  private async defaultsMap(): Promise<Map<string, boolean>> {
    return new Map(
      (await this.repository.defaults()).map((d) => [`${d.type}:${d.channel}`, d.enabled]),
    );
  }
}
