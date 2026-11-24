import { join, relative } from 'node:path';
import { Controller, Delete, Get, Patch, Post, Put, RequestMethod } from '@nestjs/common';
import { isAuditAction } from '@school-erp/shared';
import {
  appControllers,
  controllerFiles,
  routeHandlers,
  type ControllerClass,
} from '../../common/testing/controller-scan';
import {
  Audited,
  NotAudited,
  auditDeclarationOf,
  type AuditDeclaration,
} from './decorators/audited.decorator';

/*
 * D6 — every write endpoint declares its audit: `@Audited(action)` or `@NotAudited(reason)`.
 * This scans every controller under src/ and fails CI when a POST / PATCH / PUT / DELETE handler
 * has neither (edge case 9).
 */

const WRITE_METHODS = new Set([
  RequestMethod.POST,
  RequestMethod.PATCH,
  RequestMethod.PUT,
  RequestMethod.DELETE,
]);

interface WriteHandler {
  route: string;
  declaration: AuditDeclaration;
}

/** Every POST / PATCH / PUT / DELETE handler of the given controllers, with its declaration. */
function writeHandlers(controllers: ControllerClass[]): WriteHandler[] {
  return routeHandlers(controllers)
    .filter((h) => WRITE_METHODS.has(h.method))
    .map((h) => ({ route: h.route, declaration: auditDeclarationOf(h.handler) }));
}

const SRC = join(__dirname, '..', '..');

describe('every write endpoint declares its audit (D6)', () => {
  const controllers = appControllers(SRC);
  const writes = writeHandlers(controllers);

  it('finds the controllers and their write handlers', () => {
    expect(controllers.length).toBeGreaterThan(5);
    expect(writes.length).toBeGreaterThan(20);
  });

  it('edge case 9 — no POST / PATCH / PUT / DELETE handler is missing @Audited or @NotAudited', () => {
    const missing = writes.filter((w) => w.declaration.kind === 'none').map((w) => w.route);
    expect(missing).toEqual([]);
  });

  it('every @Audited action is a registry key', () => {
    const unknown = writes
      .filter((w) => w.declaration.kind === 'audited' && !isAuditAction(w.declaration.action))
      .map((w) => w.route);
    expect(unknown).toEqual([]);
  });

  it('settings writes are wired; no handler is left waiting for T28 / T29 (T31)', () => {
    const audited = writes.filter((w) => w.declaration.kind === 'audited').map((w) => w.route);
    expect(audited).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^PATCH \/settings\/school /),
        expect.stringMatching(/^POST \/settings\/school\/logo /),
      ]),
    );
    // Only deliberate reasons remain: no `wired in …` placeholder from the audit foundation.
    const placeholders = writes
      .filter((w) => w.declaration.kind === 'not-audited' && /^wired in\b/i.test(w.declaration.reason))
      .map((w) => w.route);
    expect(placeholders).toEqual([]);
  });

  it('every penalty write records its hr.penalty.* action (T29)', () => {
    const declared = writes
      .filter((w) => /^\w+ \/hr\/penalties\b/.test(w.route))
      .map((w) => [
        w.route.replace(/ \(.*\)$/, ''),
        w.declaration.kind === 'audited' ? w.declaration.action : w.declaration.kind,
      ]);
    expect(declared).toEqual([
      ['POST /hr/penalties', 'hr.penalty.record'],
      // §4 two steps (owner 2026-11-21): the stage review's approve and reject, HR's reject.
      ['POST /hr/penalties/:id/review/approve', 'hr.penalty.review'],
      ['POST /hr/penalties/:id/review/reject', 'hr.penalty.reject'],
      ['POST /hr/penalties/:id/approve', 'hr.penalty.approve'],
      ['POST /hr/penalties/:id/reject', 'hr.penalty.reject'],
      ['POST /hr/penalties/:id/cancel', 'hr.penalty.cancel'],
    ]);
  });

  it('every core and HR-people write records its action (T28)', () => {
    const declared = new Map(
      writes.map((w) => [
        w.route.replace(/ \(.*\)$/, ''),
        w.declaration.kind === 'audited' ? w.declaration.action : w.declaration.kind,
      ]),
    );
    const expected: [string, string][] = [
      // Sign-in records core.auth.sign_in itself, without a request transaction (AuthService.login).
      ['POST /auth/login', 'not-audited'],
      ['POST /auth/logout', 'core.auth.sign_out'],
      ['POST /stages', 'core.stage.create'],
      ['PATCH /stages/:id', 'core.stage.update'],
      ['PATCH /hr/settings', 'hr.settings.update'],
      ['POST /hr/departments', 'hr.department.create'],
      ['PATCH /hr/departments/:id', 'hr.department.update'],
      ['POST /hr/job-titles', 'hr.job_title.create'],
      ['PATCH /hr/job-titles/:id', 'hr.job_title.update'],
      ['POST /hr/grades', 'hr.grade.create'],
      ['PATCH /hr/grades/:id', 'hr.grade.update'],
      ['POST /hr/penalty-groups', 'hr.penalty_group.create'],
      ['PATCH /hr/penalty-groups/:id', 'hr.penalty_group.update'],
      ['POST /hr/penalty-groups/:groupId/violations', 'hr.violation.create'],
      ['PATCH /hr/violations/:id', 'hr.violation.update'],
      ['POST /hr/employees', 'hr.employee.create'],
      ['PATCH /hr/employees/:id', 'hr.employee.update'],
      ['POST /hr/employees/:id/deactivate', 'hr.employee.deactivate'],
      ['POST /hr/employees/:id/reactivate', 'hr.employee.reactivate'],
      ['POST /hr/employees/:id/photo', 'hr.employee.update'],
      ['DELETE /hr/employees/:id/photo', 'hr.employee.update'],
      ['POST /outbox/deliveries/:id/retry', 'core.outbox.retry'],
    ];
    expect(expected.map(([route]) => [route, declared.get(route)])).toEqual(expected);
    // A token refresh rotates the session; it is deliberately not recorded (D11).
    expect(declared.get('POST /auth/refresh')).toBe('not-audited');
  });

  it('every user and role write records its core.user.* / core.role.* action (R8, P2)', () => {
    const declared = writes
      .filter((w) => /^\w+ \/(users|roles|account)\b/.test(w.route))
      .map((w) => [
        w.route.replace(/ \(.*\)$/, ''),
        w.declaration.kind === 'audited' ? w.declaration.action : w.declaration.kind,
      ]);
    expect(declared).toEqual([
      ['POST /roles', 'core.role.create'],
      ['PATCH /roles/:id', 'core.role.update'],
      ['DELETE /roles/:id', 'core.role.delete'],
      ['POST /users', 'core.user.create'],
      ['PATCH /users/:id', 'core.user.update'],
      ['POST /users/:id/deactivate', 'core.user.deactivate'],
      ['POST /users/:id/reactivate', 'core.user.reactivate'],
      ['POST /users/:id/unlock-sign-in', 'core.user.unlock_sign_in'],
      ['POST /users/:id/password', 'core.user.set_password'],
      // Records core.user.change_password itself, in one transaction with the new password: no
      // request transaction held while a wrong password's count needs a connection (EVENTS gap 10).
      ['POST /account/password', 'not-audited'],
    ]);
  });

  it('the scanner itself catches an undeclared write and ignores reads', () => {
    @Controller('things')
    class ThingsController {
      @Get() list(): void {}
      @Post() create(): void {}
      @Patch(':id') @Audited('hr.employee.update') update(): void {}
      @Put(':id') @NotAudited('test only') replace(): void {}
      @Delete(':id') remove(): void {}
      @Post('blank') @NotAudited('  ') blank(): void {}
    }
    const found = writeHandlers([ThingsController]);
    expect(found.map((w) => [w.route, w.declaration.kind])).toEqual([
      ['POST /things (ThingsController.create)', 'none'],
      ['PATCH /things/:id (ThingsController.update)', 'audited'],
      ['PUT /things/:id (ThingsController.replace)', 'not-audited'],
      ['DELETE /things/:id (ThingsController.remove)', 'none'],
      // A blank reason does not count as a declaration.
      ['POST /things/blank (ThingsController.blank)', 'none'],
    ]);
  });

  it('lists the files it scanned relative to src (for the CI log)', () => {
    const files = controllerFiles(SRC).map((f) => relative(SRC, f));
    expect(files).toEqual(expect.arrayContaining(['core/settings/settings.controller.ts']));
  });
});
