import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '@school-erp/shared';
import { CodedException } from '../errors/coded.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown, nodeEnv = 'development', lang = 'en') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/x', headers: { 'accept-language': lang } }),
    }),
  } as unknown as ArgumentsHost;
  const config = { get: jest.fn().mockReturnValue(nodeEnv) } as unknown as ConfigService;
  new AllExceptionsFilter(config).catch(exception, host);
  return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  it('keeps a stable code from a CodedException', () => {
    const { status, body } = run(
      new CodedException(HttpStatus.CONFLICT, ErrorCode.PAYROLL_APPROVED),
    );
    expect(status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      statusCode: 409,
      error: 'PAYROLL_APPROVED',
      path: '/x',
    });
  });

  it('joins ValidationPipe messages and codes them VALIDATION_FAILED', () => {
    const { status, body } = run(new BadRequestException(['a is required', 'b must be a number']));
    expect(status).toBe(400);
    expect(body).toMatchObject({
      message: 'Some fields are invalid.',
      error: 'VALIDATION_FAILED',
      details: ['a is required', 'b must be a number'],
    });
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
    expect(body).toMatchObject({
      error: 'UNIQUE_VIOLATION',
      message: 'This value is already in use.',
    });
  });

  it('hides an unknown error message in production', () => {
    const { status, body } = run(
      new Error('connect ECONNREFUSED 10.0.0.7:5432 (internal detail)'),
      'production',
    );
    expect(status).toBe(500);
    expect(body).toMatchObject({ error: 'INTERNAL_ERROR' });
    expect(body.message).not.toContain('10.0.0.7');
  });

  it('translates the message by Accept-Language and keeps the same code', () => {
    const e = () => new CodedException(HttpStatus.CONFLICT, ErrorCode.PAYROLL_APPROVED);
    const en = run(e(), 'development', 'en').body;
    const ar = run(e(), 'development', 'ar').body;
    expect(en.error).toBe(ar.error);
    expect(en.message).toBe("This month's payroll is approved and locked.");
    expect(ar.message).toBe('رواتب هذا الشهر معتمدة ومقفلة.');
  });

  it('keeps the raw message for a code that has no translation', () => {
    const e = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2034', clientVersion: 'x' });
    expect(run(e).body).toMatchObject({ error: 'P2034', message: 'Database request failed' });
  });
});
