import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, UserRole } from '@school-erp/shared';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

@Roles('HR_ADMIN')
class AdminOnly {
  read(): void {}
}
class Open {
  read(): void {}
}

const ctx = (cls: { prototype: { read: () => void } }, user?: Partial<AuthUser>) =>
  ({
    getHandler: () => cls.prototype.read,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('lets the listed role through', () => {
    expect(guard.canActivate(ctx(AdminOnly, { role: 'HR_ADMIN' }))).toBe(true);
  });

  it('refuses another role, or no user, with 403', () => {
    expect(() => guard.canActivate(ctx(AdminOnly, { role: 'TEACHER' as UserRole }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx(AdminOnly))).toThrow(ForbiddenException);
  });

  it('a route without @Roles passes', () => {
    expect(guard.canActivate(ctx(Open))).toBe(true);
  });
});
