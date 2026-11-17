import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiResponse } from '../interfaces/api-response.interface';
import { ResponseUtil } from '../utils/response.util';

function isEnvelope(data: unknown): data is ApiResponse {
  return typeof data === 'object' && data !== null && 'success' in data && 'message' in data;
}

/** Wraps whatever a controller returns in the house envelope. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | ApiResponse> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | ApiResponse> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // Already enveloped (a route used ResponseUtil directly) — leave it alone.
        if (isEnvelope(data)) return data;

        const statusCode = response.statusCode;
        let message = 'Operation successful';
        if (request.method === 'POST' && statusCode === 201) message = 'Resource created successfully';
        else if (request.method === 'PUT' || request.method === 'PATCH')
          message = 'Resource updated successfully';
        else if (request.method === 'DELETE') message = 'Resource deleted successfully';
        else if (request.method === 'GET') message = 'Data retrieved successfully';

        return ResponseUtil.success(data, message, statusCode, request.url);
      }),
    );
  }
}
