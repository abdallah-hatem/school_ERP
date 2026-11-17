import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '@school-erp/shared';
import { CodedException } from '../errors/coded.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown, nodeEnv = 'development') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  const config = { get: jest.fn().mockReturnValue(nodeEnv) } as unknown as ConfigService;
  new AllExceptionsFilter(config).catch(exception, host);
  return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  it('keeps a stable code from a CodedException', () => {
    const { status, body } = run(new CodedException(HttpStatus.CONFLICT, ErrorCode.PAYROLL_APPROVED));
    expect(status).toBe(409);
    expect(body).toMatchObject({ success: false, statusCode: 409, error: 'PAYROLL_APPROVED', path: '/x' });
  });

  it('joins ValidationPipe messages and codes them VALIDATION_FAILED', () => {
    const { status, body } = run(new BadRequestException(['a is required', 'b must be a number']));
    expect(status).toBe(400);
    expect(body).toMatchObject({ message: 'a is required, b must be a number', error: 'VALIDATION_FAILED' });
  });

  it('replaces a human error label with the status code', () => {
    const { body } = run(new NotFoundException());
    expect(body.error).toBe('NOT_FOUND');
  });

  it('maps a Prisma unique violation to 409 UNIQUE_VIOLATION', () => {
    const e = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
      meta: { target: ['national_id'] },
    });
    const { status, body } = run(e);
    expect(status).toBe(409);
    expect(body).toMatchObject({ error: 'UNIQUE_VIOLATION', message: 'national_id already exists' });
  });

  it('hides an unknown error message in production', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED 10.0.0.7:5432 (internal detail)'), 'production');
    expect(status).toBe(500);
    expect(body).toMatchObject({ message: 'Internal server error', error: 'INTERNAL_ERROR' });
  });
});
