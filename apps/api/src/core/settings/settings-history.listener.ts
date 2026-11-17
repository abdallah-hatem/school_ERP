import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { SettingScope } from '@prisma/client';
import {
  SettingsEvent,
  SETTINGS_CHANGE_SCOPES,
  type SettingsChangedEvent,
} from '@school-erp/shared';
import { SettingChangeRepository } from './repositories/setting-change.repository';

/**
 * Writes ONE history row per `settings.changed` — for school settings, and for whatever HR (rule
 * settings, lists, the penalty catalogue) emits. The write that caused it has already committed;
 * a failure here is logged, never thrown back at the emitter.
 */
@Injectable()
export class SettingsHistoryListener {
  private readonly logger = new Logger(SettingsHistoryListener.name);

  constructor(private readonly changes: SettingChangeRepository) {}

  @OnEvent(SettingsEvent.CHANGED)
  async record(event: SettingsChangedEvent): Promise<void> {
    if (!SETTINGS_CHANGE_SCOPES.includes(event.scope) || !event.key) {
      this.logger.warn(`Ignored settings.changed with scope "${event.scope}" key "${event.key}"`);
      return;
    }
    const changedAt = new Date(event.changedAt);
    try {
      await this.changes.create({
        scope: event.scope.toUpperCase() as SettingScope,
        key: event.key,
        oldValue: event.oldValue,
        newValue: event.newValue,
        changedById: event.changedById ?? null,
        changedAt: Number.isNaN(changedAt.getTime()) ? new Date() : changedAt,
      });
    } catch (e) {
      this.logger.error(
        `Could not record the change of "${event.key}"`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
