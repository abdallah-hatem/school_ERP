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

  it('settings writes are wired; the handlers still waiting for T28 / T29 are listed (T31 expects none)', () => {
    const audited = writes.filter((w) => w.declaration.kind === 'audited').map((w) => w.route);
    expect(audited).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^PATCH \/settings\/school /),
        expect.stringMatching(/^POST \/settings\/school\/logo /),
      ]),
    );
    const pending = writes.filter(
      (w) =>
        w.declaration.kind === 'not-audited' && /^wired in T(28|29)$/.test(w.declaration.reason),
    );
    // Shrinks as T28 and T29 replace them with @Audited; T31 changes this to `toEqual([])`.
    expect(pending.length).toBeGreaterThan(0);
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
