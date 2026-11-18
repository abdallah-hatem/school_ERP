import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ClsService } from 'nestjs-cls';
import { AfterCommit, AfterCommitWithoutQueueError, type DbAdapter } from './transactions';

/**
 * A tiny stand-in for nestjs-cls + the transactional plugin: a context stack (`run` with
 * `inherit` copies the store) and a transaction flag that `withTransaction` sets while its
 * callback runs. Enough to see when `AfterCommit` queues, runs or drops work.
 */
function makeAfterCommit() {
  let store: Map<unknown, unknown> | null = null;
  let txDepth = 0;
  const cls = {
    isActive: () => store !== null,
    run: async (_opts: unknown, fn: () => Promise<unknown>) => {
      const parent = store;
      store = new Map(parent ?? []);
      try {
        return await fn();
      } finally {
        store = parent;
      }
    },
    get: (key: unknown) => store?.get(key),
    set: (key: unknown, value: unknown) => store?.set(key, value),
  };
  const txHost = {
    isTransactionActive: () => txDepth > 0,
    withTransaction: async (...args: unknown[]) => {
      const fn = args[args.length - 1] as () => Promise<unknown>;
      txDepth += 1;
      try {
        return await fn();
      } finally {
        txDepth -= 1;
      }
    },
  };
  const afterCommit = new AfterCommit(
    txHost as unknown as TransactionHost<DbAdapter>,
    cls as unknown as ClsService,
  );
  /** A plain `txHost.withTransaction` opened inside a context but without AfterCommit's queue. */
  const plainTransaction = (fn: () => Promise<unknown>) =>
    cls.run({}, () => txHost.withTransaction(fn));
  return { afterCommit, plainTransaction };
}

describe('AfterCommit', () => {
  it('inside its transaction, run() waits for the commit; work runs in order after it', async () => {
    const { afterCommit } = makeAfterCommit();
    const seen: string[] = [];
    await afterCommit.transaction(async () => {
      await afterCommit.run(() => seen.push('first'));
      await afterCommit.run(() => seen.push('second'));
      seen.push('in transaction');
    });
    expect(seen).toEqual(['in transaction', 'first', 'second']);
  });

  it('a rollback drops the after-commit work and runs the rollback work', async () => {
    const { afterCommit } = makeAfterCommit();
    const seen: string[] = [];
    await expect(
      afterCommit.transaction(async () => {
        await afterCommit.run(() => seen.push('after commit'));
        afterCommit.onRollback(() => seen.push('rolled back'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(seen).toEqual(['rolled back']);
  });

  it('a commit drops the rollback work', async () => {
    const { afterCommit } = makeAfterCommit();
    const seen: string[] = [];
    await afterCommit.transaction(() => {
      afterCommit.onRollback(() => seen.push('rolled back'));
      return Promise.resolve();
    });
    expect(seen).toEqual([]);
  });

  it('outside any transaction, run() runs at once and onRollback() queues nothing', async () => {
    const { afterCommit } = makeAfterCommit();
    const seen: string[] = [];
    await afterCommit.run(() => seen.push('now'));
    afterCommit.onRollback(() => seen.push('never'));
    expect(seen).toEqual(['now']);
  });

  it('gap 7 — inside a plain withTransaction (no queue) run() throws instead of running inside it', async () => {
    const { afterCommit, plainTransaction } = makeAfterCommit();
    const seen: string[] = [];
    await expect(
      plainTransaction(() => afterCommit.run(() => seen.push('inside the transaction'))),
    ).rejects.toBeInstanceOf(AfterCommitWithoutQueueError);
    expect(seen).toEqual([]);
  });

  it('inTransaction joins an open transaction (its work runs after the outer commit)', async () => {
    const { afterCommit } = makeAfterCommit();
    const seen: string[] = [];
    await afterCommit.transaction(async () => {
      await afterCommit.inTransaction(async () => {
        await afterCommit.run(() => seen.push('after the outer commit'));
      });
      seen.push('outer still open');
    });
    expect(seen).toEqual(['outer still open', 'after the outer commit']);
  });

  it('a failing after-commit step is logged, the next still runs, the caller never sees it', async () => {
    const { afterCommit } = makeAfterCommit();
    const seen: string[] = [];
    await expect(
      afterCommit.transaction(async () => {
        await afterCommit.run(() => {
          throw new Error('listener down');
        });
        await afterCommit.run(() => seen.push('next'));
        return 'ok';
      }),
    ).resolves.toBe('ok');
    expect(seen).toEqual(['next']);
  });
});
