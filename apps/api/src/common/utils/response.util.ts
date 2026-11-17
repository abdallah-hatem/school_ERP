import { HttpStatus } from '@nestjs/common';
import type { ApiResponse, Meta } from '../interfaces/api-response.interface';

/** Builders so no route hand-writes the envelope. */
export class ResponseUtil {
  static success<T>(
    data: T,
    message = 'Operation successful',
    statusCode: number = HttpStatus.OK,
    path?: string,
    meta?: Meta,
  ): ApiResponse<T> {
    return {
      success: true,
      message,
      statusCode,
      data,
      timestamp: new Date().toISOString(),
      path,
      meta,
    };
  }

  static error(
    message = 'Operation failed',
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    error?: string,
    path?: string,
  ): ApiResponse {
    return { success: false, message, statusCode, error, timestamp: new Date().toISOString(), path };
  }

  static created<T>(data: T, message = 'Resource created successfully', path?: string) {
    return this.success(data, message, HttpStatus.CREATED, path);
  }

  static deleted(message = 'Resource deleted successfully', path?: string) {
    return this.success(null, message, HttpStatus.OK, path);
  }
}
