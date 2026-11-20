import { randomUUID } from 'node:crypto';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ClsPluginTransactional, TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Request } from 'express';
import { ClsModule, ClsService } from 'nestjs-cls';
import { DatabaseModule } from './database.module';
import { DatabaseService } from './database.service';

/*
 * Request-scoped transactions (audit spec D3). `nestjs-cls` keeps one context per request; the
 * transactional plugin keeps the open Prisma transaction in it, so a service can wrap
 * "change + audit entry" in one transaction without passing `tx` through every repository.
 *
 * A repository that must join the caller's transaction injects `TransactionHost<DbAdapter>` and
 * uses `txHost.tx` (the transaction client inside a transaction, the plain client outside one).
 * Repositories still on `DatabaseService` keep working, but run outside any open transaction.
 */

export type DbAdapter = TransactionalAdapterPrisma<DatabaseService>;
export type DbTransactionHost = TransactionHost<DbAdapter>;
/** The client a repository writes with: the open transaction, or the plain client. */
export type DbClient = DbTransactionHost['tx'];

/** An incoming `x-request-id` is kept when it looks like an id; otherwise one is generated. */
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;

export function requestIdFrom(req: Pick<Request, 'headers'>): string {
  const header = req.headers['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && REQUEST_ID.test(value) ? value : randomUUID();
}

/**
 * A request-wide transaction may stay open through a whole handler (e.g. a logo upload): give it
 * longer than Prisma's 5 s default. Passed only where a request transaction is opened — nested
 * `withTransaction` calls join it and must not pass options.
 */
const REQUEST_TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 };

/** The CLS context per request (id, request) plus the Prisma transactional plugin. */
const clsRoot = ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    generateId: true,
    idGenerator: (req: Request) => requestIdFrom(req),
  },
  plugins: [
    new ClsPluginTransactional({
      imports: [DatabaseModule],
      adapter: new TransactionalAdapterPrisma<DatabaseService>({
        prismaInjectionToken: DatabaseService,
        sqlFlavor: 'postgresql',
      }),
    }),
  ],
});

const AFTER_COMMIT = Symbol('afterCommit');
type AfterCommitFn = () => unknown;

/** The work queued on one transaction: after its commit, or on its rollback. */
interface TransactionQueue {
  afterCommit: AfterCommitFn[];
  onRollback: AfterCommitFn[];
}

/**
 * `AfterCommit.run` / `onRollback` inside a transaction that has no queue: one opened by a plain
 * `txHost.withTransaction` outside `AfterCommit.transaction`. Running the work now would run it
 * inside the transaction (before the commit, and even if it then rolls back) — a programming error:
 * open the transaction with `afterCommit.inTransaction` instead (docs/EVENTS.md, gap 7).
 */
export class AfterCommitWithoutQueueError extends Error {
  constructor() {
    super(
      'AfterCommit used inside a transaction with no after-commit queue: open it with ' +
        'afterCommit.inTransaction(...) (or afterCommit.transaction), not a plain txHost.withTransaction',
    );
    this.name = AfterCommitWithoutQueueError.name;
  }
}

/**
 * Runs work after the surrounding transaction commits — e.g. publishing an event (docs/
 * ARCHITECTURE.md: "after the write is committed"). Outside a transaction it runs at once.
 */
@Injectable()
export class AfterCommit {
  private readonly logger = new Logger(AfterCommit.name);

  constructor(
    private readonly txHost: TransactionHost<DbAdapter>,
    private readonly cls: ClsService,
  ) {}

  /**
   * Opens a transaction that owns its queue: `fn` runs inside it; the after-commit work runs once
   * it has committed, and is dropped if it rolls back (the rollback work runs instead).
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const queue: TransactionQueue = { afterCommit: [], onRollback: [] };
    let result: T;
    try {
      result = await this.cls.run({ ifNested: 'inherit' }, () => {
        this.cls.set(AFTER_COMMIT, queue);
        return this.txHost.withTransaction(REQUEST_TX_OPTIONS, fn);
      });
    } catch (e) {
      await this.flush(queue.onRollback, 'Rollback work failed');
      throw e;
    }
    await this.flush(queue.afterCommit, 'After-commit work failed');
    return result;
  }

  /**
   * Runs `fn` in the open transaction (an `@Audited` request's), or — called outside one, e.g. by
   * the seed or a job — in a new transaction with its own queue. A service whose write and audit
   * entry must commit together wraps them in this.
   */
  inTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.inOpenTransaction() ? fn() : this.transaction(fn);
  }

  /**
   * Queues `fn` for after the open transaction's commit, or runs it now when none is open. Throws
   * `AfterCommitWithoutQueueError` inside a transaction that has no queue.
   */
  async run(fn: AfterCommitFn): Promise<void> {
    const queue = this.openQueue();
    if (queue) queue.afterCommit.push(fn);
    else await this.flush([fn], 'After-commit work failed');
  }

  /**
   * Queues `fn` for when the open transaction rolls back (e.g. delete a file written for it);
   * dropped on commit. Outside a transaction there is nothing to roll back: nothing is queued.
   */
  onRollback(fn: AfterCommitFn): void {
    this.openQueue()?.onRollback.push(fn);
  }

  private inOpenTransaction(): boolean {
    return this.cls.isActive() && this.txHost.isTransactionActive();
  }

  /** The open transaction's queue; undefined outside a transaction; throws when it has none. */
  private openQueue(): TransactionQueue | undefined {
    if (!this.inOpenTransaction()) return undefined;
    const queue = this.cls.get<TransactionQueue | undefined>(AFTER_COMMIT);
    if (!queue) throw new AfterCommitWithoutQueueError();
    return queue;
  }

  private async flush(queue: AfterCommitFn[], message: string): Promise<void> {
    for (const fn of queue) {
      try {
        await fn();
      } catch (e) {
        // The outcome stands; a failing side effect is logged, never thrown at the caller.
        this.logger.error(message, e instanceof Error ? e.stack : String(e));
      }
    }
  }
}

/** Request context, transactions and `AfterCommit`, for the whole app (imported once by AppModule). */
@Global()
@Module({
  imports: [clsRoot],
  providers: [AfterCommit],
  exports: [AfterCommit],
})
export class TransactionsModule {}
