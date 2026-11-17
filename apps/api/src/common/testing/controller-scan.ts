import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { CONTROLLER_WATERMARK, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

/*
 * Test support for the controller scans in CI (audit D6, permissions R4): find every controller
 * under src/ and list its route handlers, so a rule ("every write is audited", "every handler
 * declares its permission") is checked against all of them — including ones added later.
 * Used only by specs.
 */

export type ControllerClass = { new (...args: never[]): unknown; name: string; prototype: object };

export interface RouteHandler {
  method: RequestMethod;
  /** `POST /hr/penalties/:id/approve (PenaltiesController.approve)` — for failure messages. */
  route: string;
  controller: ControllerClass;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- any route handler
  handler: Function;
}

/** Every `*.controller.ts` file under `dir`. */
export function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

/** Every class decorated with `@Controller()` exported by a `*.controller.ts` under `srcDir`. */
export function appControllers(srcDir: string): ControllerClass[] {
  return controllerFiles(srcDir).flatMap((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- load each controller file
    const exported = require(file) as Record<string, unknown>;
    return Object.values(exported).filter(
      (value): value is ControllerClass =>
        typeof value === 'function' && Reflect.getMetadata(CONTROLLER_WATERMARK, value) === true,
    );
  });
}

/** Every route handler (any HTTP method) of the given controllers. */
export function routeHandlers(controllers: ControllerClass[]): RouteHandler[] {
  const out: RouteHandler[] = [];
  for (const controller of controllers) {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      if (name === 'constructor') continue;
      const handler = (controller.prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const url = [base, path].filter((p) => p && p !== '/').join('/');
      out.push({
        method,
        route: `${RequestMethod[method]} /${url} (${controller.name}.${name})`,
        controller,
        handler,
      });
    }
  }
  return out;
}
