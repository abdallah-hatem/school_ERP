import { Controller, ForbiddenException, Get, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PERMISSION_KEYS, type AuthUser } from '@school-erp/shared';
import { Permission, Public, SignedIn } from '../decorators/permission.decorator';
import { permissionsFor } from '../permissions-for';
import { PermissionGuard } from './permission.guard';

// The real rule by default; a test can hand one user a chosen set of keys.
jest.mock('../permissions-for', () => {
  const actual = jest.requireActual<typeof import('../permissions-for')>('../permissions-for');
  return { permissionsFor: jest.fn(actual.permissionsFor) };
});

const admin: AuthUser = { id: 'u-1', email: 'a@school.test', name: 'Admin', role: 'HR_ADMIN' };
/** A role P1 grants nothing to (P2 brings real roles); stands in for "a user without the key". */
const nobody = { ...admin, id: 'u-2', role: 'SOMEONE_ELSE' } as unknown as AuthUser;

@Controller('things')
class ThingsController {
  @Get('open') @Public() open(): void {}
  @Get('me') @SignedIn() me(): void {}
  @Get() @Permission('hr.penalties.view') list(): void {}
  @Get('approve') @Permission('hr.penalties.view', 'hr.penalties.approve') approve(): void {}
  @Get('forgot') forgot(): void {}
  @Get('both') @Public() @Permission('hr.penalties.view') both(): void {}
}

@Controller('guarded')
@Permission('core.audit.view')
class GuardedController {
  @Get() list(): void {}
  @Get('own') @Permission('hr.payroll.approve') own(): void {}
}

type Handler = keyof ThingsController | keyof GuardedController;

function context(handler: Handler, user?: AuthUser, controller: object = ThingsController) {
  const proto = (controller as { prototype: Record<string, unknown> }).prototype;
  return {
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard (R3, closed by default)', () => {
  const guard = new PermissionGuard();
  const run = (handler: Handler, user?: AuthUser, controller?: object) =>
    guard.canActivate(context(handler, user, controller));

  it('declared and held → passes', () => {
    expect(run('list', admin)).toBe(true);
    expect(run('approve', admin)).toBe(true);
  });

  it('declared and not held → 403', () => {
    expect(() => run('list', nobody)).toThrow(ForbiddenException);
  });

  it('several keys are all required — can view, can’t approve → 403 (edge case 9)', () => {
    const viewer = { ...admin, role: 'VIEWER' } as unknown as AuthUser;
    const keys = PERMISSION_KEYS.filter((k) => k !== 'hr.penalties.approve');
    jest.mocked(permissionsFor).mockReturnValueOnce(keys).mockReturnValueOnce(keys);
    expect(run('list', viewer)).toBe(true);
    expect(() => run('approve', viewer)).toThrow(ForbiddenException);
  });

  it('edge case 1 — no declaration → 403, even for the HR admin', () => {
    expect(() => run('forgot', admin)).toThrow(ForbiddenException);
  });

  it('conflicting declarations → 403', () => {
    expect(() => run('both', admin)).toThrow(ForbiddenException);
  });

  it('@Public → passes with or without a user', () => {
    expect(run('open')).toBe(true);
    expect(run('open', nobody)).toBe(true);
  });

  it('@SignedIn → any signed-in user, whatever they hold', () => {
    expect(run('me', nobody)).toBe(true);
    expect(run('me', admin)).toBe(true);
  });

  it('signed out → 401 before any 403 (declared, signed-in-only and undeclared alike)', () => {
    expect(() => run('list')).toThrow(UnauthorizedException);
    expect(() => run('me')).toThrow(UnauthorizedException);
    expect(() => run('forgot')).toThrow(UnauthorizedException);
  });

  it('a class-level @Permission covers handlers that declare nothing; the handler’s own wins', () => {
    expect(run('list', admin, GuardedController)).toBe(true);
    expect(() => run('list', nobody, GuardedController)).toThrow(ForbiddenException);
    expect(run('own', admin, GuardedController)).toBe(true);
  });
});
