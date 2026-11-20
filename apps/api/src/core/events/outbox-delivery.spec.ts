import { HrEvent } from '@school-erp/shared';
import type { ClsService } from 'nestjs-cls';
import type { AfterCommit } from '../../database/transactions';
import { EventListeners } from './event-listeners';
import { OutboxDelivery } from './outbox-delivery.service';
import {
  afterFailure,
  CLAIM_TOLERANCE_MS,
  claimDueBy,
  MAX_FAILURES,
  retryDelayMs,
  RETRY_DELAYS_MS,
} from './outbox.pure';
import type { ClaimedDelivery, OutboxRepository } from './repositories/outbox.repository';

const NOW = new Date('2026-11-18T10:00:00.000Z');
const SECOND = 1000;

const claimed = (over: Partial<ClaimedDelivery> = {}): ClaimedDelivery => ({
  id: 'd1',
  eventId: 'e1',
  listener: 'accounting.payroll-taxes',
  attempts: 0,
  eventName: HrEvent.PAYROLL_APPROVED,
  payload: { runId: 'r1' },
  seq: BigInt(1),
  publishedAt: NOW,
  ...over,
});

/**
 * The repository, faked over one in-memory delivery table, and `AfterCommit.transaction` faked as
 * "the writes made inside commit together or not at all": each write inside is staged and applied
 * only when the callback resolves.
 */
function makeDelivery(rows: Record<string, { status: string; attempts: number }> = {}) {
  const table = new Map(Object.entries(rows));
  const events = new Map<string, string>();
  let staged: (() => void)[] | null = null;
  const write = (fn: () => void) => (staged ? staged.push(fn) : fn());
  const repository = {
    claim: jest.fn((_opts: unknown) => Promise.resolve([] as ClaimedDelivery[])),
    markDelivered: jest.fn((id: string) => {
      const row = table.get(id);
      if (!row || row.status !== 'pending') return Promise.resolve(false);
      write(() => table.set(id, { status: 'delivered', attempts: row.attempts }));
      return Promise.resolve(true);
    }),
    settleEvent: jest.fn((eventId: string) => (write(() => events.set(eventId, 'delivered')), Promise.resolve())),
    recordFailure: jest.fn(
      (id: string, seen: number, failure: { status: string; nextAttemptAt: Date; error: string }) => {
        const row = table.get(id);
        if (!row || row.status !== 'pending' || row.attempts !== seen) return Promise.resolve(false);
        table.set(id, { status: failure.status, attempts: seen + 1 });
        return Promise.resolve(true);
      },
    ),
    setEventStatus: jest.fn((eventId: string, status: string) => (events.set(eventId, status), Promise.resolve())),
  };
  const afterCommit = {
    transaction: async (fn: () => Promise<unknown>) => {
      staged = [];
      try {
        const result = await fn();
        for (const w of staged) w();
        return result;
      } finally {
        staged = null;
      }
    },
  };
  const cls = { run: (_o: unknown, fn: () => unknown) => fn() };
  const listeners = new EventListeners({} as never);
  const service = new OutboxDelivery(
    repository as unknown as OutboxRepository,
    listeners,
    afterCommit as unknown as AfterCommit,
    cls as unknown as ClsService,
  );
  return { service, repository, listeners, table, events };
}

describe('retry schedule (owner, 2026-11-18)', () => {
  it('10 s, 1 min, 5 min, 30 min, then every 2 h', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(retryDelayMs)).toEqual([
      10 * SECOND,
      60 * SECOND,
      300 * SECOND,
      1800 * SECOND,
      7200 * SECOND,
      7200 * SECOND,
      7200 * SECOND,
    ]);
    expect(RETRY_DELAYS_MS).toHaveLength(5);
  });

  it('dead at the 10th failure, not before (attempts counts failures)', () => {
    expect(MAX_FAILURES).toBe(10);
    expect(afterFailure(9, NOW)).toEqual({
      status: 'pending',
      nextAttemptAt: new Date(NOW.getTime() + 7200 * SECOND),
    });
    expect(afterFailure(10, NOW).status).toBe('dead');
    expect(afterFailure(1, NOW).nextAttemptAt).toEqual(new Date(NOW.getTime() + 10 * SECOND));
  });
});

describe('OutboxDelivery.deliver', () => {
  it('runs the listener and marks the delivery and event delivered, together', async () => {
    const { service, listeners, table, events } = makeDelivery({ d1: { status: 'pending', attempts: 0 } });
    const handle = jest.fn(() => Promise.resolve());
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', { handle });
    await expect(service.deliver(claimed(), () => NOW)).resolves.toBe('delivered');
    expect(handle).toHaveBeenCalledWith(
      { runId: 'r1' },
      { eventId: 'e1', deliveryId: 'd1', attempt: 1, publishedAt: NOW },
    );
    // attempts counts failures: delivered at the first try, it stays 0.
    expect(table.get('d1')).toEqual({ status: 'delivered', attempts: 0 });
    expect(events.get('e1')).toBe('delivered');
  });

  it('attempts counts failures only: two failures then a success → 2, and the listener saw tries 1, 2, 3', async () => {
    const { service, listeners, table } = makeDelivery({ d1: { status: 'pending', attempts: 0 } });
    const tries: number[] = [];
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', {
      handle: (_p: unknown, ctx: unknown) => {
        const { attempt } = ctx as { attempt: number };
        tries.push(attempt);
        return attempt < 3 ? Promise.reject(new Error('not yet')) : Promise.resolve();
      },
    });
    await expect(service.deliver(claimed({ attempts: 0 }), () => NOW)).resolves.toBe('failed');
    await expect(service.deliver(claimed({ attempts: 1 }), () => NOW)).resolves.toBe('failed');
    await expect(service.deliver(claimed({ attempts: 2 }), () => NOW)).resolves.toBe('delivered');
    expect(tries).toEqual([1, 2, 3]);
    expect(table.get('d1')).toEqual({ status: 'delivered', attempts: 2 });
  });

  it('idempotent — a redelivery of a handled (event, listener) is a no-op: the listener does not run again', async () => {
    const { service, listeners } = makeDelivery({ d1: { status: 'delivered', attempts: 0 } });
    const handle = jest.fn(() => Promise.resolve());
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', { handle });
    await expect(service.deliver(claimed(), () => NOW)).resolves.toBe('already_handled');
    expect(handle).not.toHaveBeenCalled();
  });

  it('a listener that throws: its writes roll back, the delivery stays pending, retried 10 s later', async () => {
    const { service, listeners, repository, table, events } = makeDelivery({
      d1: { status: 'pending', attempts: 0 },
    });
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', {
      handle: () => Promise.reject(new Error('tax rule missing')),
    });
    await expect(service.deliver(claimed(), () => NOW)).resolves.toBe('failed');
    expect(table.get('d1')).toEqual({ status: 'pending', attempts: 1 });
    expect(events.has('e1')).toBe(false);
    expect(repository.recordFailure).toHaveBeenCalledWith('d1', 0, {
      status: 'pending',
      nextAttemptAt: new Date(NOW.getTime() + 10 * SECOND),
      error: expect.stringContaining('tax rule missing'),
    });
  });

  it('the 10th failure: dead, the event dead too (logged)', async () => {
    const { service, listeners, table, events } = makeDelivery({ d1: { status: 'pending', attempts: 9 } });
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', {
      handle: () => Promise.reject(new Error('still down')),
    });
    await expect(service.deliver(claimed({ attempts: 9 }), () => NOW)).resolves.toBe('dead');
    expect(table.get('d1')).toEqual({ status: 'dead', attempts: 10 });
    expect(events.get('e1')).toBe('dead');
  });

  it('a listener that no longer exists is a failure (retried, then dead) — never a crash', async () => {
    const { service, table } = makeDelivery({ d1: { status: 'pending', attempts: 0 } });
    await expect(service.deliver(claimed({ listener: 'gone.listener' }), () => NOW)).resolves.toBe('failed');
    expect(table.get('d1')).toEqual({ status: 'pending', attempts: 1 });
  });

  it('a failure another worker already counted is not counted twice', async () => {
    const { service, listeners, table } = makeDelivery({ d1: { status: 'pending', attempts: 1 } });
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', {
      handle: () => Promise.reject(new Error('down')),
    });
    // Claimed when attempts was 0; meanwhile another pass failed it once.
    await service.deliver(claimed({ attempts: 0 }), () => NOW);
    expect(table.get('d1')).toEqual({ status: 'pending', attempts: 1 });
  });
});

describe('OutboxDelivery passes', () => {
  it('the nudge claims only its event; the poll claims everything due (1 s tolerance), with a 5-minute lease', async () => {
    const { service, repository } = makeDelivery();
    await service.nudge('e1', () => NOW);
    await service.deliverDue(() => NOW);
    expect(repository.claim).toHaveBeenNthCalledWith(1, {
      eventId: 'e1',
      dueBy: new Date(NOW.getTime() + SECOND),
      leaseUntil: new Date(NOW.getTime() + 5 * 60 * SECOND),
      limit: 50,
    });
    expect(repository.claim).toHaveBeenNthCalledWith(2, {
      dueBy: new Date(NOW.getTime() + SECOND),
      leaseUntil: new Date(NOW.getTime() + 5 * 60 * SECOND),
      limit: 50,
    });
  });

  it('the backoff counts from the claim (the pass start), not from the failure a few ms later', async () => {
    const { service, repository, listeners } = makeDelivery({ d1: { status: 'pending', attempts: 1 } });
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', {
      handle: () => Promise.reject(new Error('down')),
    });
    repository.claim.mockResolvedValueOnce([claimed({ attempts: 1 })]);
    // The clock moves on while the pass works: 7 ms by the time the listener has failed.
    let t = NOW.getTime();
    const clock = () => new Date((t += 7) - 7);
    await service.deliverDue(clock);
    expect(repository.recordFailure).toHaveBeenCalledWith('d1', 1, {
      status: 'pending',
      nextAttemptAt: new Date(NOW.getTime() + 60 * SECOND), // 2nd failure: exactly 1 min after the claim
      error: expect.stringContaining('down'),
    });
  });

  it('a retry due at a poll tick is claimed by that tick, even when the tick fires a little early or late', () => {
    // Failed in the pass of the tick at NOW: due exactly one interval later, on a tick.
    const due = afterFailure(2, NOW).nextAttemptAt;
    const tick = NOW.getTime() + 60 * SECOND;
    for (const jitter of [-5, 0, 3, 250, CLAIM_TOLERANCE_MS]) {
      expect(due.getTime()).toBeLessThanOrEqual(claimDueBy(new Date(tick + jitter)).getTime());
    }
    // …but never claimed more than the tolerance early.
    expect(due.getTime()).toBeGreaterThan(claimDueBy(new Date(tick - CLAIM_TOLERANCE_MS - 1)).getTime());
    expect(CLAIM_TOLERANCE_MS).toBe(SECOND);
  });

  it('delivers the claimed rows in the order claimed and counts the outcomes', async () => {
    const { service, repository, listeners } = makeDelivery({
      d1: { status: 'pending', attempts: 0 },
      d2: { status: 'pending', attempts: 0 },
    });
    const order: string[] = [];
    listeners.addOutbox(HrEvent.PAYROLL_APPROVED, 'accounting.payroll-taxes', {
      handle: (_p: unknown, ctx: unknown) => {
        const id = (ctx as { deliveryId: string }).deliveryId;
        order.push(id);
        return id === 'd2' ? Promise.reject(new Error('x')) : Promise.resolve();
      },
    });
    repository.claim.mockResolvedValueOnce([claimed({ id: 'd1' }), claimed({ id: 'd2', eventId: 'e2', seq: BigInt(2) })]);
    await expect(service.deliverDue(() => NOW)).resolves.toEqual({ delivered: 1, failed: 1 });
    expect(order).toEqual(['d1', 'd2']);
  });

  it('a claim that fails (database down) is logged; the pass delivers nothing and never throws', async () => {
    const { service, repository } = makeDelivery();
    repository.claim.mockRejectedValueOnce(new Error('connection refused'));
    await expect(service.deliverDue(() => NOW)).resolves.toEqual({ delivered: 0, failed: 0 });
  });
});
