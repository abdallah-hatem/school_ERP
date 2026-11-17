import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import { SettingsEvent, type SettingsChangedEvent } from '@school-erp/shared';
import type { DbAdapter } from '../../database/transactions';
import { AuditService } from '../audit';
import { historyAuditTarget } from './settings.pure';

/**
 * TEMPORARY (until T28): list and catalogue edits — stages, departments, job titles, penalty
 * groups, violations — still announce themselves with `settings.changed` after their write
 * commits. This turns each into an audit entry (in its own transaction), keyed and valued as the
 * old history rows were, so Settings → Change history keeps showing them. T28 records these in
 * the write's own transaction and removes this listener.
 *
 * School and HR settings are NOT handled here: `SettingsService` records them in the write's
 * transaction (D2). A failure here is logged, never thrown back at the emitter.
 */
@Injectable()
export class SettingsHistoryListener {
  private readonly logger = new Logger(SettingsHistoryListener.name);

  constructor(
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {}

  @OnEvent(SettingsEvent.CHANGED)
  async record(event: SettingsChangedEvent): Promise<void> {
    if (event.scope === 'school' || event.scope === 'hr') return;
    const target = event.key ? historyAuditTarget(event) : null;
    if (!target) {
      this.logger.warn(`Ignored settings.changed with scope "${event.scope}" key "${event.key}"`);
      return;
    }
    try {
      await this.txHost.withTransaction(Propagation.RequiresNew, () =>
        this.audit.record({
          ...target,
          changes: [{ field: event.key, before: event.oldValue, after: event.newValue }],
          actor: event.changedById ? { id: event.changedById } : null,
        }),
      );
    } catch (e) {
      this.logger.error(
        `Could not record the change of "${event.key}"`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
