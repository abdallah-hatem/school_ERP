import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@school-erp/shared';

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
  ) {
    super({ message, error: code, statusCode: status }, status);
  }
}
