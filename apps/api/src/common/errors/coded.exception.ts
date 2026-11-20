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
  ) {
    super({ message, error: code, statusCode: status, ...(params ? { params } : {}) }, status);
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
