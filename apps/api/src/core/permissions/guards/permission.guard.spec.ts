import { Controller, ForbiddenException, Get, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PERMISSION_KEYS, type AuthUser, type PermissionKey } from '@school-erp/shared';
import {
  AllowedBeforePasswordChange,
  Permission,
  Public,
  SignedIn,
} from '../decorators/permission.decorator';
import type { PermissionsService } from '../permissions.service';
import { PermissionGuard } from './permission.guard';

const admin: AuthUser = { id: 'u-1', email: 'a@school.test', name: 'Admin', mustChangePassword: false };
/** A user whose roles grant nothing. */
const nobody: AuthUser = { ...admin, id: 'u-2' };
/** Can view penalties, can't approve them. */
const viewer: AuthUser = { ...admin, id: 'u-3' };

const HELD: Record<string, readonly PermissionKey[]> = {
  'u-1': PERMISSION_KEYS,
  'u-2': [],
  'u-3': PERMISSION_KEYS.filter((k) => k !== 'hr.penalties.approve'),
};

@Controller('things')
class ThingsController {
  @Get('open') @Public() open(): void {}
  @Get('me') @SignedIn() me(): void {}
  @Get('password') @SignedIn() @AllowedBeforePasswordChange() password(): void {}
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
  const permissions = {
    permissionsFor: jest.fn((u: Pick<AuthUser, 'id'>) => Promise.resolve([...(HELD[u.id] ?? [])])),
  };
  const guard = new PermissionGuard(permissions as unknown as PermissionsService);
  const run = (handler: Handler, user?: AuthUser, controller?: object) =>
    guard.canActivate(context(handler, user, controller));

  it('declared and held → passes', async () => {
    await expect(run('list', admin)).resolves.toBe(true);
    await expect(run('approve', admin)).resolves.toBe(true);
  });

  it('declared and not held → 403', async () => {
    await expect(run('list', nobody)).rejects.toThrow(ForbiddenException);
  });

  it('several keys are all required — can view, can’t approve → 403 (edge case 9)', async () => {
    await expect(run('list', viewer)).resolves.toBe(true);
    await expect(run('approve', viewer)).rejects.toThrow(ForbiddenException);
  });

  it('edge case 1 — no declaration → 403, even for the System admin', async () => {
    await expect(run('forgot', admin)).rejects.toThrow(ForbiddenException);
  });

  it('conflicting declarations → 403', async () => {
    await expect(run('both', admin)).rejects.toThrow(ForbiddenException);
  });

  it('@Public → passes with or without a user, without reading permissions', async () => {
    permissions.permissionsFor.mockClear();
    await expect(run('open')).resolves.toBe(true);
    await expect(run('open', nobody)).resolves.toBe(true);
    expect(permissions.permissionsFor).not.toHaveBeenCalled();
  });

  it('@SignedIn → any signed-in user, whatever they hold', async () => {
    await expect(run('me', nobody)).resolves.toBe(true);
    await expect(run('me', admin)).resolves.toBe(true);
  });

  it('signed out → 401 before any 403 (declared, signed-in-only and undeclared alike)', async () => {
    await expect(run('list')).rejects.toThrow(UnauthorizedException);
    await expect(run('me')).rejects.toThrow(UnauthorizedException);
    await expect(run('forgot')).rejects.toThrow(UnauthorizedException);
  });

  describe('a temporary password (mustChangePassword, P3)', () => {
    const fresh: AuthUser = { ...admin, mustChangePassword: true };
    const refusal = { response: { error: 'PASSWORD_CHANGE_REQUIRED', statusCode: 403 } };

    it('reaches only the routes marked @AllowedBeforePasswordChange', async () => {
      await expect(run('password', fresh)).resolves.toBe(true);
    });

    it('anything else → 403 PASSWORD_CHANGE_REQUIRED, even a key they hold or a @SignedIn route', async () => {
      await expect(run('list', fresh)).rejects.toMatchObject(refusal);
      await expect(run('me', fresh)).rejects.toMatchObject(refusal);
      await expect(run('own', fresh, GuardedController)).rejects.toMatchObject(refusal);
    });

    it('still 401 when signed out, and @Public still passes', async () => {
      await expect(run('password')).rejects.toThrow(UnauthorizedException);
      await expect(run('open', fresh)).resolves.toBe(true);
    });

    it('once the password is changed the same user is back to normal', async () => {
      await expect(run('list', { ...fresh, mustChangePassword: false })).resolves.toBe(true);
    });
  });

  it('a class-level @Permission covers handlers that declare nothing; the handler’s own wins', async () => {
    await expect(run('list', admin, GuardedController)).resolves.toBe(true);
    await expect(run('list', nobody, GuardedController)).rejects.toThrow(ForbiddenException);
    await expect(run('own', admin, GuardedController)).resolves.toBe(true);
  });
});
