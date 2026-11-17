import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Controller, Delete, Get, Patch, Post, Put, RequestMethod } from '@nestjs/common';
import { CONTROLLER_WATERMARK, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { isAuditAction } from '@school-erp/shared';
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

type Ctor = { new (...args: never[]): unknown; name: string; prototype: object };

/** Every POST / PATCH / PUT / DELETE handler of the given controllers, with its declaration. */
function writeHandlers(controllers: Ctor[]): WriteHandler[] {
  const out: WriteHandler[] = [];
  for (const controller of controllers) {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      if (name === 'constructor') continue;
      const handler = (controller.prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined || !WRITE_METHODS.has(method)) continue;
      const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      out.push({
        route: `${RequestMethod[method]} /${[base, path].filter((p) => p && p !== '/').join('/')} (${controller.name}.${name})`,

        declaration: auditDeclarationOf(handler),
      });
    }
  }
  return out;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

/** Every class decorated with `@Controller()` exported by a `*.controller.ts` under src/. */
function appControllers(): Ctor[] {
  const src = join(__dirname, '..', '..');
  return controllerFiles(src).flatMap((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- load each controller file
    const exported = require(file) as Record<string, unknown>;
    return Object.values(exported).filter(
      (value): value is Ctor =>
        typeof value === 'function' && Reflect.getMetadata(CONTROLLER_WATERMARK, value) === true,
    );
  });
}

describe('every write endpoint declares its audit (D6)', () => {
  const controllers = appControllers();
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
    const files = controllerFiles(join(__dirname, '..', '..')).map((f) =>
      relative(join(__dirname, '..', '..'), f),
    );
    expect(files).toEqual(expect.arrayContaining(['core/settings/settings.controller.ts']));
  });
});
