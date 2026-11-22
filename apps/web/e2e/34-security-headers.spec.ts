import { expect, test, type Page } from '@playwright/test';
import { settleStreams } from './support/stream';
import { signIn } from './support/ui';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/**
 * Runs in the `desktop-en` project. The Content-Security-Policy (docs/ARCHITECTURE.md → Security)
 * blocks nothing the app needs: each main screen loads with the policy on its response, and with no
 * `securitypolicyviolation` event and no console error — the streamed reveal scripts, next/image,
 * the service worker and sign-in all run under it.
 */

const locale = 'en' as const;
const SCREENS = ['', '/employees', '/penalties', '/payroll', '/settings', '/activity'] as const;

interface Problems {
  violations: string[];
  errors: string[];
}

/** Collects CSP violations (reported in the page) and console errors from the first script on. */
async function watch(page: Page): Promise<Problems> {
  const problems: Problems = { violations: [], errors: [] };
  await page.exposeFunction('__cspViolation', (text: string) => problems.violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as { __cspViolation: (t: string) => void }).__cspViolation;
      report(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'} on ${location.pathname}`);
    });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.errors.push(`${page.url()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.errors.push(`${page.url()}: ${err.message}`));
  return problems;
}

function expectPolicy(csp: string | undefined): void {
  expect(csp, 'Content-Security-Policy header').toBeTruthy();
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
}

test('sign-in and the main screens load under the CSP with no violation and no console error', async ({ page }) => {
  const problems = await watch(page);

  const login = await page.goto(`/${locale}/login`);
  expectPolicy(login?.headers()['content-security-policy']);
  expect(login?.headers()['x-content-type-options']).toBe('nosniff');
  expect(login?.headers()['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  // The streamed reveal and Next's own scripts carry the response's nonce.
  const nonce = /'nonce-([^']+)'/.exec(login?.headers()['content-security-policy'] ?? '')?.[1];
  const scripts = await page.locator('script:not([src])').evaluateAll((els) => els.map((s) => (s as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((n) => n === nonce)).toBe(true);

  await signIn(page, locale);

  for (const path of SCREENS) {
    const res = await page.goto(`/${locale}${path}`);
    expect(res?.status(), path || '/').toBeLessThan(400);
    expectPolicy(res?.headers()['content-security-policy']);
    // Images (the logo, photos, next/image) all loaded.
    const broken = await page
      .locator('img:visible')
      .evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).map((i) => (i as HTMLImageElement).src));
    expect(broken, `broken images on ${path || '/'}`).toEqual([]);
  }

  // The service worker registered under worker-src 'self'.
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/');

  expect(problems.violations, 'CSP violations').toEqual([]);
  expect(problems.errors, 'console errors').toEqual([]);
});
