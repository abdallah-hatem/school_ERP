import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type AuditAction } from '@school-erp/shared';
import { ClsService } from 'nestjs-cls';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { CodedException } from '../../../common/errors/coded.exception';
import { AfterCommit } from '../../../database/transactions';
import { AUDIT_RECORDED } from '../audit.service';
import { AUDITED_KEY } from '../decorators/audited.decorator';

/**
 * Global (APP_INTERCEPTOR). For an `@Audited(action)` handler: runs the handler — validation
 * included — in one transaction, and after it succeeds checks that it recorded `action` (D6b).
 * If not, it throws `AUDIT_NOT_RECORDED` (500) and the transaction rolls back. A handler that
 * throws keeps its own error, and its transaction (entries included) rolls back. Other handlers
 * pass straight through.
 */
@Injectable()
export class AuditedInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly afterCommit: AfterCommit,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<AuditAction | undefined>(AUDITED_KEY, context.getHandler());
    if (!action) return next.handle();
    return from(this.run(action, next));
  }

  private run(action: AuditAction, next: CallHandler): Promise<unknown> {
    const recorded: AuditAction[] = [];
    return this.cls.run({ ifNested: 'inherit' }, () => {
      this.cls.set(AUDIT_RECORDED, recorded);
      return this.afterCommit.transaction(async () => {
        // `next.handle()` binds the handler to the current async context: call it in here.
        const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
        if (!recorded.includes(action)) {
          throw new CodedException(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.AUDIT_NOT_RECORDED);
        }
        return result;
      });
    });
  }
}
