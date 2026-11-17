import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ErrorCode, LOGO_UPLOAD } from '@school-erp/shared';
import { Observable } from 'rxjs';
import { CodedException } from '../../../common/errors/coded.exception';

const MulterLogo: Type<NestInterceptor> = FileInterceptor('file', {
  limits: { fileSize: LOGO_UPLOAD.maxBytes, files: 1 },
});

/**
 * Reads the multipart `file` field into memory, refusing anything over 2 MB while it streams in.
 * The size error becomes `FILE_TOO_LARGE` (413) instead of multer's generic one.
 */
@Injectable()
export class LogoUploadInterceptor implements NestInterceptor {
  private readonly inner = new MulterLogo();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.inner.intercept(context, next);
    } catch (e) {
      if (e instanceof PayloadTooLargeException) {
        throw new CodedException(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.FILE_TOO_LARGE);
      }
      throw e;
    }
  }
}
