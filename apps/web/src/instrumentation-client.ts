import { z } from 'zod';

/*
 * Runs in the browser before the app's code (Next's client instrumentation hook).
 *
 * zod probes whether it may compile its validators with `new Function` the first time an object
 * schema is built. Our Content-Security-Policy has no `'unsafe-eval'` (docs/ARCHITECTURE.md →
 * Security), so the probe fails — harmlessly, zod falls back — but the browser still reports a
 * `securitypolicyviolation` on every page. `jitless` skips the probe: the same validation, no eval,
 * no violation. It must be set before any schema module loads, hence here. (zod keeps this config
 * on `globalThis`, so the shared package's schemas see it too.)
 */
z.config({ jitless: true });
