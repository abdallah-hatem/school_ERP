import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ErrorCode } from '@school-erp/shared';
import { Observable } from 'rxjs';
import { CodedException } from '../../../common/errors/coded.exception';
import { detectImageType, IMAGE_MIME, type ImageType } from '../settings.pure';

/** A multipart file as multer hands it over (memory storage). */
export interface UploadedFileLike {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** What one kind of image upload accepts (the school logo, an employee photo…). */
export interface ImageUploadRules {
  maxBytes: number;
  mimeTypes: readonly string[];
}

/**
 * Checks an uploaded image against `rules` and returns its bytes and real type (the file extension
 * to store it under). Missing file → 400; too large → 413 `FILE_TOO_LARGE`; the declared type and the real
 * bytes must both be an allowed image, and agree → otherwise 400 `INVALID_FILE_TYPE`.
 */
export function checkImageUpload(
  file: UploadedFileLike | undefined,
  rules: ImageUploadRules,
): { type: ImageType; buffer: Buffer } {
  if (!file) throw new BadRequestException('file is required');
  if (file.size > rules.maxBytes) {
    throw new CodedException(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.FILE_TOO_LARGE);
  }
  const type = detectImageType(file.buffer);
  if (!type || IMAGE_MIME[type] !== file.mimetype || !rules.mimeTypes.includes(file.mimetype)) {
    throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_FILE_TYPE);
  }
  return { type, buffer: file.buffer };
}

/** A stored document's real type: PDF, or an image (never SVG — a browser runs it). */
export type DocumentType = 'pdf' | Exclude<ImageType, 'svg'>;

/** The file's real type from its first bytes: `%PDF-`, or a PNG / JPEG / WebP image. */
export function detectDocumentType(buffer: Buffer): DocumentType | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) return 'pdf';
  const image = detectImageType(buffer);
  return image && image !== 'svg' ? image : null;
}

const DOCUMENT_MIME: Record<DocumentType, string> = {
  pdf: 'application/pdf',
  png: IMAGE_MIME.png,
  jpg: IMAGE_MIME.jpg,
  webp: IMAGE_MIME.webp,
};

/**
 * Checks an uploaded document (a scanned letter, an attachment) like `checkImageUpload`: missing
 * → 400; too large → 413 `FILE_TOO_LARGE`; the declared type and the real bytes must both be
 * allowed and agree → else 400 `INVALID_FILE_TYPE` (a renamed file is refused).
 */
export function checkDocumentUpload(
  file: UploadedFileLike | undefined,
  rules: ImageUploadRules,
): { type: DocumentType; buffer: Buffer } {
  if (!file) throw new BadRequestException('file is required');
  if (file.size > rules.maxBytes) {
    throw new CodedException(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.FILE_TOO_LARGE);
  }
  const type = detectDocumentType(file.buffer);
  if (!type || DOCUMENT_MIME[type] !== file.mimetype || !rules.mimeTypes.includes(file.mimetype)) {
    throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_FILE_TYPE);
  }
  return { type, buffer: file.buffer };
}

/**
 * An interceptor reading the multipart `file` field into memory, refusing anything over `maxBytes`
 * while it streams in. The size error becomes `FILE_TOO_LARGE` (413) instead of multer's generic one.
 */
export function imageUploadInterceptor(maxBytes: number): Type<NestInterceptor> {
  const Multer: Type<NestInterceptor> = FileInterceptor('file', {
    limits: { fileSize: maxBytes, files: 1 },
  });

  @Injectable()
  class ImageUploadInterceptor implements NestInterceptor {
    private readonly inner = new Multer();

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
  return ImageUploadInterceptor;
}
