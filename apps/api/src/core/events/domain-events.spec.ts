import { CoreEvent, HrEvent, SettingsEvent, type PayrollApprovedEvent } from '@school-erp/shared';
import type { AfterCommit } from '../../database/transactions';
import { DomainEvents } from './domain-events';
import { EventListeners } from './event-listeners';
import { OutboxDelivery } from './outbox-delivery.service';
import type { ClaimedDelivery, OutboxRepository } from './repositories/outbox.repository';
import type { ClsService } from 'nestjs-cls';

/**
 * `AfterCommit`, faked as one open transaction: `run()` queues until `commit()`, `rollback()`
 * drops the queue; with `open: false` it behaves as outside any transaction (runs at once).
 */
function makeEvents(opts: { open?: boolean } = {}) {
  const queue: (() => unknown)[] = [];
  let open = opts.open ?? true;
  const afterCommit = {
    run: jest.fn(async (fn: () => unknown) => {
      if (open) queue.push(fn);
      else await fn();
    }),
    inTransaction: jest.fn(async (fn: () => Promise<unknown>) => {
      if (open) return fn();
      // Outside a transaction: one of its own, committed at once.
      open = true;
      const result = await fn();
      open = false;
      for (const f of queue.splice(0)) await f();
      return result;
    }),
  };
  const commit = async () => {
    open = false;
    for (const f of queue.splice(0)) await f();
  };
  const rollback = () => {
    open = false;
    queue.splice(0);
  };
  const listeners = new EventListeners({} as never);
  const outbox = { insertEvent: jest.fn(() => Promise.resolve('event-1')) };
  const delivery = { nudgeSoon: jest.fn(), idle: jest.fn(() => Promise.resolve()) };
  const events = new DomainEvents(
    afterCommit as unknown as AfterCommit,
    listeners,
    outbox as unknown as OutboxRepository,
    delivery as unknown as OutboxDelivery,
  );
  return { events, listeners, outbox, delivery, afterCommit, commit, rollback };
}

const sessionsEnded = { userId: 'u1', reason: 'deactivated' as const, at: '2026-11-18T10:00:00.000Z' };
const approved: PayrollApprovedEvent = {
  runId: 'r1',
  month: '2026-11',
  totals: {} as PayrollApprovedEvent['totals'],
  approvedById: 'u1',
  at: '2026-11-18T10:00:00.000Z',
};

describe('DomainEvents.publish — typing', () => {
  it('a wrong name, a wrong payload or the wrong kind fails typecheck', () => {
    const { events } = makeEvents();
    const never = (fn: () => unknown) => fn; // never called: these lines are for the compiler
    never(() => {
      // @ts-expect-error — not an event name
      void events.publish('hr.payroll.approvd', approved, { mustDeliver: true });
      // @ts-expect-error — the payload of another event
      void events.publish(CoreEvent.USER_SESSIONS_ENDED, approved);
      // @ts-expect-error — a must-deliver event without { mustDeliver: true }
      void events.publish(HrEvent.PAYROLL_APPROVED, approved);
      // @ts-expect-error — a fire-and-forget event can't be must-deliver
      void events.publish(CoreEvent.USER_SESSIONS_ENDED, sessionsEnded, { mustDeliver: true });
    });
    expect(true).toBe(true);
  });

  it('a cast past the types is refused at run time', async () => {
    const { events } = makeEvents();
    const loose = events as unknown as { publish(n: string, p: unknown, o?: unknown): Promise<void> };
    await expect(loose.publish(HrEvent.PAYROLL_APPROVED, approved)).rejects.toThrow(/must-deliver/);
    await expect(
      loose.publish(CoreEvent.USER_SESSIONS_ENDED, sessionsEnded, { mustDeliver: true }),
    ).rejects.toThrow(/fire-and-forget/);
  });
});

describe('DomainEvents.publish — fire-and-forget', () => {
  it('inside a transaction the listeners run only after the commit', async () => {
    const { events, listeners, commit } = makeEvents();
    const handle = jest.fn(() => Promise.resolve());
    listeners.addInMemory(CoreEvent.USER_SESSIONS_ENDED, 'SessionsEnded', { handle });
    await events.publish(CoreEvent.USER_SESSIONS_ENDED, sessionsEnded);
    expect(handle).not.toHaveBeenCalled();
    await commit();
    expect(handle).toHaveBeenCalledWith(sessionsEnded);
  });

  it('a rollback drops the event: no listener runs', async () => {
    const { events, listeners, rollback } = makeEvents();
    const handle = jest.fn(() => Promise.resolve());
    listeners.addInMemory(CoreEvent.USER_SESSIONS_ENDED, 'SessionsEnded', { handle });
    await events.publish(CoreEvent.USER_SESSIONS_ENDED, sessionsEnded);
    rollback();
    expect(handle).not.toHaveBeenCalled();
  });

  it('outside a transaction the listeners run at once', async () => {
    const { events, listeners } = makeEvents({ open: false });
    const handle = jest.fn(() => Promise.resolve());
    listeners.addInMemory(SettingsEvent.CHANGED, 'Cache', { handle });
    const payload = {
      scope: 'school' as const,
      key: 'school.workStart',
      oldValue: '07:30',
      newValue: '08:00',
      changedById: null,
      changedAt: '2026-11-18T10:00:00.000Z',
    };
    await events.publish(SettingsEvent.CHANGED, payload);
    expect(handle).toHaveBeenCalledWith(payload);
  });

  it('a listener that throws is logged; the next one still runs; publish never throws', async () => {
    const { events, listeners, commit } = makeEvents();
    const seen: string[] = [];
    listeners.addInMemory(CoreEvent.USER_SESSIONS_ENDED, 'Broken', {
      handle: () => Promise.reject(new Error('down')),
    });
    listeners.addInMemory(CoreEvent.USER_SESSIONS_ENDED, 'Fine', {
      handle: () => (seen.push('fine'), Promise.resolve()),
    });
    await events.publish(CoreEvent.USER_SESSIONS_ENDED, sessionsEnded);
    await expect(commit()).resolves.toBeUndefined();
    expect(seen).toEqual(['fine']);
  });
});

describe('DomainEvents.publish — must-deliver', () => {
  it("writes the event with one delivery per outbox listener in the caller's transaction, and nudges after the commit", async () => {
    const { events, listeners, outbox, delivery, commit } = makeEvents();
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', { handle: jest.fn() });
    await events.publish(HrEvent.PAYROLL_APPROVED, approved, { mustDeliver: true });
    expect(outbox.insertEvent).toHaveBeenCalledWith(
      HrEvent.PAYROLL_APPROVED,
      approved,
      ['accounting.payroll-taxes'],
      expect.any(Date),
    );
    expect(delivery.nudgeSoon).not.toHaveBeenCalled();
    await commit();
    expect(delivery.nudgeSoon).toHaveBeenCalledWith('event-1');
  });

  it('a rollback: no nudge (and the outbox row rolls back with the change)', async () => {
    const { events, listeners, delivery, rollback } = makeEvents();
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', { handle: jest.fn() });
    await events.publish(HrEvent.PAYROLL_APPROVED, approved, { mustDeliver: true });
    rollback();
    expect(delivery.nudgeSoon).not.toHaveBeenCalled();
  });

  it('outside a transaction: written in one of its own and nudged at once', async () => {
    const { events, listeners, outbox, delivery } = makeEvents({ open: false });
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', { handle: jest.fn() });
    await events.publish(HrEvent.PAYROLL_APPROVED, approved, { mustDeliver: true });
    expect(outbox.insertEvent).toHaveBeenCalledTimes(1);
    expect(delivery.nudgeSoon).toHaveBeenCalledWith('event-1');
  });

  it('no outbox listener: the event is still written (delivered at once), nothing to nudge', async () => {
    const { events, outbox, delivery, commit } = makeEvents();
    await events.publish(
      HrEvent.EMPLOYEE_DEACTIVATED,
      { employeeId: 'e1', at: '2026-11-18T10:00:00.000Z' },
      { mustDeliver: true },
    );
    expect(outbox.insertEvent).toHaveBeenCalledWith(
      HrEvent.EMPLOYEE_DEACTIVATED,
      expect.anything(),
      [],
      expect.any(Date),
    );
    await commit();
    expect(delivery.nudgeSoon).not.toHaveBeenCalled();
  });
});

describe('DomainEvents.publish — the nudge never holds the request', () => {
  /**
   * The real `OutboxDelivery` over a fake repository (one due delivery) and a listener that hangs
   * until released — a stuck accounting listener, say. Outside a transaction, so "after the
   * commit" is now.
   */
  function withSlowListener() {
    const { afterCommit, listeners, outbox } = makeEvents({ open: false });
    const row: ClaimedDelivery = {
      id: 'd1',
      eventId: 'event-1',
      listener: 'accounting.payroll-taxes',
      attempts: 0,
      eventName: HrEvent.PAYROLL_APPROVED,
      payload: approved,
      seq: BigInt(1),
      publishedAt: new Date(),
    };
    const repository = {
      claim: jest.fn(() => Promise.resolve([row])),
      markDelivered: jest.fn(() => Promise.resolve(true)),
      settleEvent: jest.fn(() => Promise.resolve()),
    };
    const contexts: string[] = [];
    const cls = {
      run: (opts: { ifNested?: string }, fn: () => unknown) => (contexts.push(opts.ifNested ?? ''), fn()),
    };
    const tx = { transaction: (fn: () => Promise<unknown>) => fn() };
    const delivery = new OutboxDelivery(
      repository as unknown as OutboxRepository,
      listeners,
      tx as unknown as AfterCommit,
      cls as unknown as ClsService,
    );
    const events = new DomainEvents(
      afterCommit as unknown as AfterCommit,
      listeners,
      outbox as unknown as OutboxRepository,
      delivery,
    );
    let release!: () => void;
    const handled = jest.fn();
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', {
      handle: () =>
        new Promise<void>((resolve) => {
          release = () => (handled(), resolve());
        }),
    });
    return { events, repository, handled, contexts, release: () => release() };
  }

  it('publish (and the request) resolves while the listener is still running; idle() waits for it', async () => {
    const { events, repository, handled, contexts, release } = withSlowListener();
    await events.publish(HrEvent.PAYROLL_APPROVED, approved, { mustDeliver: true });
    // Returned before the nudge even claimed: it starts on the next turn of the event loop.
    expect(repository.claim).not.toHaveBeenCalled();
    let idle = false;
    const waiting = events.idle().then(() => (idle = true));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(handled).not.toHaveBeenCalled();
    expect(idle).toBe(false);
    release();
    await waiting;
    expect(handled).toHaveBeenCalledTimes(1);
    expect(repository.settleEvent).toHaveBeenCalledWith('event-1');
    // The nudge and its delivery each run in a context of their own, never the request's.
    expect(contexts).toEqual(['override', 'override']);
  });

  it('a nudge that fails (database down) is logged, never thrown at the request; idle() still resolves', async () => {
    const { events, repository, handled } = withSlowListener();
    repository.claim.mockRejectedValueOnce(new Error('connection refused'));
    await expect(events.publish(HrEvent.PAYROLL_APPROVED, approved, { mustDeliver: true })).resolves.toBeUndefined();
    await expect(events.idle()).resolves.toBeUndefined();
    expect(handled).not.toHaveBeenCalled();
  });
});

describe('EventListeners', () => {
  it('refuses two outbox listeners with one name, and a listener of the wrong kind', () => {
    const listeners = new EventListeners({} as never);
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'a.b', { handle: jest.fn() });
    expect(() => listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'a.b', { handle: jest.fn() })).toThrow(
      /Two outbox listeners/,
    );
    expect(() => listeners.addOutbox(CoreEvent.USER_SESSIONS_ENDED, 'c.d', { handle: jest.fn() })).toThrow(
      /fire-and-forget/,
    );
    expect(() => listeners.addInMemory(HrEvent.PAYROLL_APPROVED, 'X', { handle: jest.fn() })).toThrow(
      /must-deliver/,
    );
    expect(listeners.outboxNamesOf(HrEvent.PAYROLL_APPROVED)).toEqual(['a.b']);
  });
});
