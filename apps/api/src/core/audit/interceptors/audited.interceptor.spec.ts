import { BadRequestException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type AuditAction } from '@school-erp/shared';
import type { ClsService } from 'nestjs-cls';
import { defer, lastValueFrom, of } from 'rxjs';
import { CodedException } from '../../../common/errors/coded.exception';
import type { AfterCommit } from '../../../database/transactions';
import { AUDIT_RECORDED } from '../audit.service';
import { Audited } from '../decorators/audited.decorator';
import { AuditedInterceptor } from './audited.interceptor';

class Handlers {
  @Audited('core.settings.update')
  audited(): void {}
  plain(): void {}
}

/**
 * A fake CLS store and transaction: `committed` / `rolledBack` show what the real transaction
 * would do — commit when the callback resolves, roll back when it throws.
 */
function setup() {
  const store = new Map<unknown, unknown>();
  const cls = {
    run: (_opts: unknown, fn: () => unknown) => fn(),
    set: (k: unknown, v: unknown) => store.set(k, v),
  };
  const tx = { committed: 0, rolledBack: 0 };
  const afterCommit = {
    transaction: async (fn: () => Promise<unknown>) => {
      try {
        const r = await fn();
        tx.committed++;
        return r;
      } catch (e) {
        tx.rolledBack++;
        throw e;
      }
    },
  };
  const interceptor = new AuditedInterceptor(
    new Reflector(),
    afterCommit as unknown as AfterCommit,
    cls as unknown as ClsService,
  );
  /** What `audit.record(action)` does to the request: marks the action recorded. */
  const record = (action: AuditAction) => (store.get(AUDIT_RECORDED) as AuditAction[]).push(action);
  const ctx = (name: keyof Handlers) =>
    ({ getHandler: () => Handlers.prototype[name] }) as unknown as ExecutionContext;
  return { interceptor, record, ctx, tx };
}

const handle = (fn: () => unknown): CallHandler => ({
  handle: () => defer(() => Promise.resolve().then(fn)),
});

const errorOf = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe('AuditedInterceptor (D6b)', () => {
  it('an @Audited handler that recorded its action: the result passes and the transaction commits', async () => {
    const { interceptor, record, ctx, tx } = setup();
    const out = interceptor.intercept(
      ctx('audited'),
      handle(() => {
        record('core.settings.update');
        return { ok: true };
      }),
    );
    await expect(lastValueFrom(out)).resolves.toEqual({ ok: true });
    expect(tx).toEqual({ committed: 1, rolledBack: 0 });
  });

  it('an @Audited handler that succeeds without recording its action → AUDIT_NOT_RECORDED and a rollback', async () => {
    const { interceptor, record, ctx, tx } = setup();
    const out = interceptor.intercept(
      ctx('audited'),
      handle(() => {
        record('core.stage.create'); // another action does not count
        return { ok: true };
      }),
    );
    const e = await errorOf(lastValueFrom(out));
    expect(e).toBeInstanceOf(CodedException);
    expect((e as CodedException).code).toBe(ErrorCode.AUDIT_NOT_RECORDED);
    expect((e as CodedException).getStatus()).toBe(500);
    expect(tx).toEqual({ committed: 0, rolledBack: 1 });
  });

  it('an @Audited handler that throws keeps its own error and records nothing (edge case 1)', async () => {
    const { interceptor, record, ctx, tx } = setup();
    const out = interceptor.intercept(
      ctx('audited'),
      handle(() => {
        record('core.settings.update');
        throw new BadRequestException('invalid');
      }),
    );
    const e = await errorOf(lastValueFrom(out));
    expect(e).toBeInstanceOf(BadRequestException);
    // Rolled back: the entry it recorded goes with the change.
    expect(tx).toEqual({ committed: 0, rolledBack: 1 });
  });

  it('edge case 2 — the audit write fails inside the handler: that error reaches the user, the change rolls back', async () => {
    const { interceptor, ctx, tx } = setup();
    const out = interceptor.intercept(
      ctx('audited'),
      handle(() => {
        throw new Error('audit insert failed');
      }),
    );
    await expect(lastValueFrom(out)).rejects.toThrow('audit insert failed');
    expect(tx.rolledBack).toBe(1);
  });

  it('a handler without @Audited passes straight through, with no transaction', async () => {
    const { interceptor, ctx, tx } = setup();
    const next: CallHandler = { handle: () => of('plain') };
    await expect(lastValueFrom(interceptor.intercept(ctx('plain'), next))).resolves.toBe('plain');
    expect(tx).toEqual({ committed: 0, rolledBack: 0 });
  });
});
