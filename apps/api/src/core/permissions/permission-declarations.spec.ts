import { join, relative } from 'node:path';
import { Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { isPermissionKey } from '@school-erp/shared';
import {
  appControllers,
  controllerFiles,
  routeHandlers,
  type ControllerClass,
} from '../../common/testing/controller-scan';
import {
  Permission,
  allowedBeforePasswordChange,
  Public,
  SignedIn,
  permissionDeclarationOf,
  type PermissionDeclaration,
} from './decorators/permission.decorator';

/*
 * R4 — every endpoint declares who may use it: `@Permission(...keys)`, `@SignedIn()` or
 * `@Public()`. This scans every controller under src/ and fails CI when a handler (any method)
 * has none, or more than one (edge case 1). At run time the guard refuses the same handlers (403).
 */

interface Declared {
  route: string;
  declaration: PermissionDeclaration;
}

function declarations(controllers: ControllerClass[]): Declared[] {
  return routeHandlers(controllers).map((h) => ({
    route: h.route,
    declaration: permissionDeclarationOf(h.handler, h.controller),
  }));
}

const SRC = join(__dirname, '..', '..');
const kinds = (found: Declared[], kind: PermissionDeclaration['kind']) =>
  found.filter((d) => d.declaration.kind === kind).map((d) => d.route);

describe('every endpoint declares its permission (R4)', () => {
  const controllers = appControllers(SRC);
  const found = declarations(controllers);

  it('finds the controllers and their handlers', () => {
    expect(controllers.length).toBeGreaterThan(5);
    expect(found.length).toBeGreaterThan(40);
  });

  it('edge case 1 — no handler is missing @Permission, @SignedIn or @Public', () => {
    expect(kinds(found, 'none')).toEqual([]);
  });

  it('no handler declares more than one of them', () => {
    expect(kinds(found, 'conflict')).toEqual([]);
  });

  it('every @Permission key is a registry key', () => {
    const unknown = found
      .filter(
        (d) =>
          d.declaration.kind === 'permission' &&
          !d.declaration.keys.every((k) => isPermissionKey(k)),
      )
      .map((d) => d.route);
    expect(unknown).toEqual([]);
  });

  it('only what the sign-in page needs is public (§2), plus the health check', () => {
    const routes = kinds(found, 'public').map((r) => r.replace(/ \(.*\)$/, ''));
    expect(routes.sort()).toEqual(
      [
        'POST /auth/login',
        'POST /auth/refresh',
        'GET /settings/school/public',
        'GET /files/logo/:name',
        'GET /health',
      ].sort(),
    );
  });

  it('signed-in-only is kept to what every account needs', () => {
    const routes = kinds(found, 'signed-in').map((r) => r.replace(/ \(.*\)$/, ''));
    expect(routes.sort()).toEqual(
      [
        'GET /auth/me',
        'POST /auth/logout',
        'GET /files/:folder/:name',
        // My account: see your own account, change your own password (R9, P3).
        'GET /account',
        'POST /account/password',
        // The bell and My account → Notifications: each person's own notifications (§11).
        'GET /notifications',
        'GET /notifications/unread-count',
        'POST /notifications/read-all',
        'POST /notifications/:id/read',
        'POST /notifications/:id/unread',
        'GET /notifications/preferences',
        'PUT /notifications/preferences',
      ].sort(),
    );
  });

  it('a temporary password reaches only /auth/me, sign-out and a new password (P3)', () => {
    const allowed = routeHandlers(appControllers(SRC))
      .filter((h) => allowedBeforePasswordChange(h.handler))
      .map((h) => h.route.replace(/ \(.*\)$/, ''));
    expect(allowed.sort()).toEqual(['GET /auth/me', 'POST /account/password', 'POST /auth/logout']);
  });

  it('the activity log needs core.audit.view; approvals need their own key', () => {
    const keysOf = (pattern: RegExp) =>
      found
        .filter((d) => pattern.test(d.route))
        .map((d) =>
          d.declaration.kind === 'permission' ? d.declaration.keys : d.declaration.kind,
        );
    expect(keysOf(/^GET \/audit/)).toEqual(Array(6).fill(['core.audit.view']));
    expect(keysOf(/^POST \/hr\/penalties\/:id\/approve /)).toEqual([['hr.penalties.approve']]);
    expect(keysOf(/^POST \/hr\/payroll-runs\/:id\/approve /)).toEqual([['hr.payroll.approve']]);
  });

  it('users and roles: reading needs .view, every write needs .manage (P2)', () => {
    const declared = (pattern: RegExp) =>
      found
        .filter((d) => pattern.test(d.route))
        .map((d) => [
          d.route.replace(/ \(.*\)$/, ''),
          d.declaration.kind === 'permission' ? d.declaration.keys : d.declaration.kind,
        ]);
    expect(declared(/^\w+ \/users/)).toEqual([
      ['GET /users', ['core.users.view']],
      // The linked-employee picker belongs to editing a user (P3).
      ['GET /users/employee-options', ['core.users.manage']],
      ['GET /users/:id', ['core.users.view']],
      ['POST /users', ['core.users.manage']],
      ['PATCH /users/:id', ['core.users.manage']],
      ['POST /users/:id/deactivate', ['core.users.manage']],
      ['POST /users/:id/reactivate', ['core.users.manage']],
      ['POST /users/:id/unlock-sign-in', ['core.users.manage']],
      ['POST /users/:id/password', ['core.users.manage']],
    ]);
    expect(declared(/^\w+ \/roles/)).toEqual([
      ['GET /roles', ['core.roles.view']],
      ['GET /roles/:id', ['core.roles.view']],
      ['POST /roles', ['core.roles.manage']],
      ['PATCH /roles/:id', ['core.roles.manage']],
      ['DELETE /roles/:id', ['core.roles.manage']],
    ]);
  });

  it('the scanner itself catches an undeclared handler, of any method', () => {
    @Controller('things')
    class ThingsController {
      @Get() list(): void {}
      @Get('open') @Public() open(): void {}
      @Get('me') @SignedIn() me(): void {}
      @Post() @Permission('hr.employees.create') create(): void {}
      @Patch(':id') @Public() @SignedIn() both(): void {}
      @Delete(':id') remove(): void {}
    }
    @Controller('guarded')
    @Permission('core.audit.view')
    class GuardedController {
      @Get() list(): void {}
    }
    expect(
      declarations([ThingsController, GuardedController]).map((d) => [d.route, d.declaration.kind]),
    ).toEqual([
      ['GET /things (ThingsController.list)', 'none'],
      ['GET /things/open (ThingsController.open)', 'public'],
      ['GET /things/me (ThingsController.me)', 'signed-in'],
      ['POST /things (ThingsController.create)', 'permission'],
      ['PATCH /things/:id (ThingsController.both)', 'conflict'],
      ['DELETE /things/:id (ThingsController.remove)', 'none'],
      // A class-level @Permission covers its handlers.
      ['GET /guarded (GuardedController.list)', 'permission'],
    ]);
  });

  it('lists the files it scanned relative to src (for the CI log)', () => {
    const files = controllerFiles(SRC).map((f) => relative(SRC, f));
    expect(files).toEqual(
      expect.arrayContaining([
        'core/audit/audit.controller.ts',
        'modules/hr/payroll/controllers/payroll-runs.controller.ts',
      ]),
    );
  });
});
