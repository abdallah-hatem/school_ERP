import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ErrorCode, type ErrorParams } from '@school-erp/shared';
import type { Request, Response } from 'express';
import { CodedException } from '../errors/coded.exception';
import { resolveLanguage, translateError } from '../i18n/i18n';
import { ResponseUtil } from '../utils/response.util';

type Normalized = {
  status: number;
  message: string;
  error: string;
  details?: string[];
  params?: ErrorParams;
};

const STABLE_CODE = /^[A-Z][A-Z0-9_]+$/;

/** Fallback code per status for exceptions thrown without one (Nest built-ins, ValidationPipe). */
function codeForStatus(status: number, isValidation: boolean): ErrorCode {
  if (status === 400) return isValidation ? ErrorCode.VALIDATION_FAILED : ErrorCode.BAD_REQUEST;
  if (status === 401) return ErrorCode.UNAUTHORIZED;
  if (status === 403) return ErrorCode.FORBIDDEN;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 409) return ErrorCode.CONFLICT;
  if (status === 413) return ErrorCode.PAYLOAD_TOO_LARGE;
  if (status >= 500) return ErrorCode.INTERNAL_ERROR;
  return ErrorCode.BAD_REQUEST;
}

/**
 * Turns every failure into the envelope, with a stable `error` code and a `message` translated
 * from that code by `Accept-Language` (same code in every language; message EN or AR).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message, error, details, params } = this.normalize(exception);
    const translated = translateError(
      error,
      resolveLanguage(req.headers?.['accept-language']),
      params,
    );

    // Only 5xx is our bug — 4xx is the caller's and would just be noise.
    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res
      .status(status)
      .json(ResponseUtil.error(translated ?? message, status, error, req.url, details, params));
  }

  private normalize(exception: unknown): Normalized {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // ValidationPipe returns message as string[] — join so the client shows one line.
        const raw = b.message;
        const isValidation = Array.isArray(raw);
        const message = isValidation
          ? raw.join(', ')
          : typeof raw === 'string'
            ? raw
            : exception.message;
        const error =
          typeof b.error === 'string' && STABLE_CODE.test(b.error)
            ? b.error
            : codeForStatus(status, isValidation);
        if (isValidation) return { status, message, error, details: (raw as unknown[]).map(String) };
        const params = exception instanceof CodedException ? exception.params : undefined;
        return params ? { status, message, error, params } : { status, message, error };
      }
      return { status, message: exception.message, error: codeForStatus(status, false) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid query',
        error: ErrorCode.PRISMA_VALIDATION,
      };
    }

    // Unknown: never leak an internal message or stack to the client in production.
    const isProduction = this.config.get<string>('nodeEnv') === 'production';
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        !isProduction && exception instanceof Error ? exception.message : 'Internal server error',
      error: ErrorCode.INTERNAL_ERROR,
    };
  }

  private fromPrisma(e: Prisma.PrismaClientKnownRequestError): Normalized {
    const target = Array.isArray(e.meta?.target)
      ? (e.meta.target as string[]).join(', ')
      : undefined;

    switch (e.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: target ? `${target} already exists` : 'Resource already exists',
          error: ErrorCode.UNIQUE_VIOLATION,
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Resource not found',
          error: ErrorCode.NOT_FOUND,
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related resource does not exist',
          error: ErrorCode.FOREIGN_KEY_VIOLATION,
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Operation would violate a required relation',
          error: ErrorCode.RELATION_VIOLATION,
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Database request failed',
          error: e.code,
        };
    }
  }
}
