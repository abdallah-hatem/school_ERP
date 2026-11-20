import type { TransactionHost } from '@nestjs-cls/transactional';
import type { DbAdapter } from '../../database/transactions';
import type { OutboxDelivery } from './outbox-delivery.service';
import { OutboxCleanupJob, OutboxDeliverJob } from './outbox.jobs';
import { OutboxRepository, type ClaimedDelivery } from './repositories/outbox.repository';

const NOW = new Date('2026-11-18T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function makeRepository(returned: Partial<ClaimedDelivery>[] = []) {
  const sql: string[] = [];
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      sql.push(strings.join('?'));
      return Promise.resolve(returned);
    }),
    outboxEvent: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 3 })),
      create: jest.fn(() => Promise.resolve({ id: 'e1' })),
    },
  };
  const repository = new OutboxRepository({ tx } as unknown as TransactionHost<DbAdapter>);
  return { repository, tx, sql };
}

describe('OutboxRepository', () => {
  it('claims with FOR UPDATE SKIP LOCKED, oldest event first, and takes a lease in the same statement', async () => {
    const { repository, sql } = makeRepository();
    await repository.claim({ dueBy: NOW, leaseUntil: new Date(NOW.getTime() + 300_000), limit: 50 });
    const statement = sql[0].replace(/\s+/g, ' ');
    expect(statement).toContain(`WHERE d."status" = 'pending' AND d."next_attempt_at" <=`);
    expect(statement).toContain('ORDER BY e."seq", d."listener"');
    expect(statement).toContain('FOR UPDATE OF d SKIP LOCKED');
    expect(statement).toContain('UPDATE "outbox_deliveries" d SET "next_attempt_at" =');
  });

  it('returns the claimed rows in creation order (RETURNING keeps none)', async () => {
    const { repository } = makeRepository([
      { id: 'c', seq: BigInt(3), listener: 'a' },
      { id: 'b2', seq: BigInt(2), listener: 'z' },
      { id: 'b1', seq: BigInt(2), listener: 'a' },
    ]);
    const rows = await repository.claim({ dueBy: NOW, leaseUntil: NOW, limit: 50 });
    expect(rows.map((r) => r.id)).toEqual(['b1', 'b2', 'c']);
  });

  it('an event with no listener is written delivered; with listeners, pending with one delivery each', async () => {
    const { repository, tx } = makeRepository();
    await repository.insertEvent('hr.employee.deactivated', { employeeId: 'x' }, [], NOW);
    await repository.insertEvent('hr.payroll.approved', { runId: 'r' }, ['accounting.payroll-taxes'], NOW);
    const calls = tx.outboxEvent.create.mock.calls as unknown as { data: Record<string, unknown> }[][];
    expect(calls[0][0].data).toMatchObject({ status: 'delivered', deliveries: { create: [] } });
    expect(calls[1][0].data).toMatchObject({
      status: 'pending',
      deliveries: {
        create: [{ listener: 'accounting.payroll-taxes', status: 'pending', nextAttemptAt: NOW }],
      },
    });
  });
});

describe('outbox jobs', () => {
  it('cleanup deletes delivered events older than 30 days only (dead and pending stay)', async () => {
    const { repository, tx } = makeRepository();
    jest.useFakeTimers().setSystemTime(NOW);
    try {
      await new OutboxCleanupJob(repository).run();
    } finally {
      jest.useRealTimers();
    }
    expect(tx.outboxEvent.deleteMany).toHaveBeenCalledWith({
      where: { status: 'delivered', createdAt: { lt: new Date(NOW.getTime() - 30 * DAY) } },
    });
  });

  it("the poll is 'idle' (not recorded) when it did nothing, fails the run when a delivery failed", async () => {
    const pass = jest.fn();
    const job = new OutboxDeliverJob({ deliverDue: pass } as unknown as OutboxDelivery);
    pass.mockResolvedValueOnce({ delivered: 0, failed: 0 });
    await expect(job.run()).resolves.toBe('idle');
    pass.mockResolvedValueOnce({ delivered: 2, failed: 0 });
    await expect(job.run()).resolves.toBeUndefined();
    pass.mockResolvedValueOnce({ delivered: 1, failed: 1 });
    await expect(job.run()).rejects.toThrow('1 outbox delivery failed (1 delivered)');
  });
});
