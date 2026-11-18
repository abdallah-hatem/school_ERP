import type { AfterCommit } from '../../database/transactions';

/*
 * Test support: a stand-in for `AfterCommit` that behaves like one database transaction. Writes
 * made inside `inTransaction` (each mock calls `write(name)`) are only `committed` when the
 * callback resolves; when it throws they are dropped, as a rollback would. Used only by specs.
 */
export function fakeTransaction() {
  const state = { committed: [] as string[], commits: 0, rollbacks: 0 };
  let pending: string[] | null = null;

  const write = (name: string) => {
    if (!pending) throw new Error(`"${name}" written outside a transaction`);
    pending.push(name);
  };

  const inTransaction = async <T>(fn: () => Promise<T>): Promise<T> => {
    pending = [];
    try {
      const result = await fn();
      state.committed.push(...pending);
      state.commits++;
      return result;
    } catch (e) {
      state.rollbacks++;
      throw e;
    } finally {
      pending = null;
    }
  };

  return { afterCommit: { inTransaction } as unknown as AfterCommit, state, write };
}
