import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsEvent, type SettingsChangedEvent } from '@school-erp/shared';
import { AfterCommit } from '../../database/transactions';
import { AuditService } from '../audit';
import { historyAuditTarget } from './settings.pure';

/** A list / catalogue change: stages, departments, job titles, penalty groups, violations. */
export type ListHistoryChange = Omit<SettingsChangedEvent, 'changedAt'> & {
  scope: 'lists' | 'catalogue';
};

/**
 * The history of list and catalogue edits (Settings history, §7), written in the change's own
 * transaction (audit D2): the owning service calls `record()` inside the transaction that wrote
 * the change, so the change and its history commit or roll back together. The entry is the one
 * the old after-commit listener wrote — the history key as the field, whole snapshots as before /
 * after, both names as the label. `settings.changed` still fires, after the commit.
 *
 * School, HR and accounting settings don't come here: `SettingsService.setValues` records them.
 */
@Injectable()
export class SettingsHistory {
  constructor(
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Records the change in the open transaction (throws outside one, like `audit.record`). Call it
   * on every successful create / update — an update that changed nothing writes no entry but
   * still answers the endpoint's `@Audited` check.
   */
  async record(change: ListHistoryChange): Promise<void> {
    const event: SettingsChangedEvent = { ...change, changedAt: new Date().toISOString() };
    const target = historyAuditTarget(event);
    if (!target) throw new Error(`No history action for "${change.scope}" key "${change.key}"`);
    await this.audit.record({
      ...target,
      changes: [{ field: change.key, before: change.oldValue, after: change.newValue }],
      ...(change.changedById ? { actor: { id: change.changedById } } : {}),
    });
    if (!isDeepStrictEqual(change.oldValue, change.newValue)) {
      await this.afterCommit.run(() => this.events.emitAsync(SettingsEvent.CHANGED, event));
    }
  }
}
