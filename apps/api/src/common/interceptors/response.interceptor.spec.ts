import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import type { ApiResponse } from '../interfaces/api-response.interface';
import { ResponseUtil } from '../utils/response.util';
import { ResponseInterceptor } from './response.interceptor';

function ctx(method: string, statusCode: number): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url: '/things' }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

const handler = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it('wraps a plain value in the envelope', async () => {
    const out = await lastValueFrom(interceptor.intercept(ctx('GET', 200), handler({ status: 'ok' })));
    expect(out).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'Data retrieved successfully',
      data: { status: 'ok' },
      path: '/things',
    });
    expect(typeof (out as ApiResponse).timestamp).toBe('string');
  });

  it('passes an already-built envelope through untouched', async () => {
    const env = ResponseUtil.success([1], 'Listed', 200, '/things', { total: 1, page: 1, limit: 20 });
    const out = await lastValueFrom(interceptor.intercept(ctx('GET', 200), handler(env)));
    expect(out).toBe(env);
  });

  it('labels a 201 POST as created', async () => {
    const out = await lastValueFrom(interceptor.intercept(ctx('POST', 201), handler({ id: 'a' })));
    expect((out as ApiResponse).message).toBe('Resource created successfully');
  });

  it('passes a file download through unwrapped', async () => {
    const file = new StreamableFile(Buffer.from('x'));
    const out = await lastValueFrom(interceptor.intercept(ctx('GET', 200), handler(file)));
    expect(out).toBe(file);
  });
});
