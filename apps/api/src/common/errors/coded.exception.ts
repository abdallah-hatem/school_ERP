import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, ErrorParams } from '@school-erp/shared';

/**
 * An HTTP exception carrying a stable code from `ErrorCode`. The filter puts the code in the
 * envelope's `error`; the message is translated by the i18n layer (T2).
 *
 * @example throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PAYROLL_APPROVED);
 */
export class CodedException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string = code,
    readonly params?: ErrorParams,
    /** The fresh state the client needs to retry (the envelope's `data`), e.g. a 409's new list. */
    readonly data?: unknown,
  ) {
    super({ message, error: code, statusCode: status, ...(params ? { params } : {}) }, status);
  }

  /**
   * With `params` and the envelope's `data`: what changed, so the client can show it and retry
   * without another request.
   *
   * @example throw CodedException.withData(HttpStatus.CONFLICT, ErrorCode.PENALTY_RECOUNT_CHANGED, { count: 2 }, { recount });
   */
  static withData(status: HttpStatus, code: ErrorCode, params: ErrorParams, data: unknown): CodedException {
    return new CodedException(status, code, code, params, data);
  }

  /**
   * With values for the translated message — `{ count }` picks its plural form — also sent to the
   * client as the envelope's `params`, so the web app can word it itself.
   *
   * @example throw CodedException.withParams(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.TOO_MANY_ATTEMPTS, { count: 12 });
   */
  static withParams(status: HttpStatus, code: ErrorCode, params: ErrorParams): CodedException {
    return new CodedException(status, code, code, params);
  }
}
