import { Injectable, Module } from '@nestjs/common';
import {
  CoreEvent,
  HrEvent,
  SettingsEvent,
  type DomainEventMap,
  type FireAndForgetEventName,
  type MustDeliverEventName,
} from '@school-erp/shared';
import { OnDomainEvent } from '../../src/core/events';
import type { DatabaseService } from '../../src/database/database.service';

/*
 * Events in e2e. Fire-and-forget events are recorded by real listeners (so only what was delivered
 * after a commit shows up): pass `EventRecorderModule` in `createAppAsTestUser`'s extra imports and
 * read `recorded(name)`. Must-deliver events are rows in `outbox_events`: `outboxEvents(db, name)`.
 */

const log: { name: FireAndForgetEventName; payload: unknown }[] = [];

/** What listeners received for `name` since the last `clearRecorded()`, in order. */
export function recorded<N extends FireAndForgetEventName>(name: N): DomainEventMap[N][] {
  return log.filter((e) => e.name === name).map((e) => e.payload as DomainEventMap[N]);
}

export function clearRecorded(): void {
  log.splice(0);
}

const push = (name: FireAndForgetEventName, payload: unknown) => {
  log.push({ name, payload });
  return Promise.resolve();
};

@OnDomainEvent(SettingsEvent.CHANGED)
@Injectable()
class SettingsChangedRecorder {
  handle(p: DomainEventMap[typeof SettingsEvent.CHANGED]) {
    return push(SettingsEvent.CHANGED, p);
  }
}

@OnDomainEvent(HrEvent.EMPLOYEE_HIRED)
@Injectable()
class EmployeeHiredRecorder {
  handle(p: DomainEventMap[typeof HrEvent.EMPLOYEE_HIRED]) {
    return push(HrEvent.EMPLOYEE_HIRED, p);
  }
}

@OnDomainEvent(HrEvent.EMPLOYEE_UPDATED)
@Injectable()
class EmployeeUpdatedRecorder {
  handle(p: DomainEventMap[typeof HrEvent.EMPLOYEE_UPDATED]) {
    return push(HrEvent.EMPLOYEE_UPDATED, p);
  }
}

@OnDomainEvent(CoreEvent.USER_SESSIONS_ENDED)
@Injectable()
class SessionsEndedRecorder {
  handle(p: DomainEventMap[typeof CoreEvent.USER_SESSIONS_ENDED]) {
    return push(CoreEvent.USER_SESSIONS_ENDED, p);
  }
}

@Module({
  providers: [SettingsChangedRecorder, EmployeeHiredRecorder, EmployeeUpdatedRecorder, SessionsEndedRecorder],
})
export class EventRecorderModule {}

/** The outbox rows of a must-deliver event whose payload matches `where` (top-level fields). */
export async function outboxEvents<N extends MustDeliverEventName>(
  db: DatabaseService,
  name: N,
  where: Partial<DomainEventMap[N]> = {},
): Promise<{ id: string; status: string; payload: DomainEventMap[N] }[]> {
  const rows = await db.outboxEvent.findMany({
    where: { name },
    orderBy: { seq: 'asc' },
    select: { id: true, status: true, payload: true },
  });
  return rows
    .map((r) => ({ ...r, payload: r.payload as unknown as DomainEventMap[N] }))
    .filter((r) =>
      Object.entries(where).every(([k, v]) => (r.payload as unknown as Record<string, unknown>)[k] === v),
    );
}
