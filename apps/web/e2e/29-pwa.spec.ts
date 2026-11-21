import { expect, test } from '@playwright/test';
import type { PublicSchoolSettings } from '@school-erp/shared';
import { Api } from './support/api';
import { t } from './support/i18n';
import { shoot, signIn } from './support/ui';

/**
 * Runs in the `desktop-en` project. The installable app (owner, 2026-11-21): the manifest from the
 * school's settings with icons drawn from its logo, the service worker registering for the whole
 * app, and the branded offline page when a page can't load. Push itself is covered by the API e2e
 * (a stand-in push service) and the component tests; a browser here has no push service.
 */

const locale = 'en' as const;

test('the manifest names the app after the school, and its icons are drawn and served', async ({ page, request }) => {
  const api = await Api.asAdmin();
  const school = await api.get<PublicSchoolSettings>('/settings/school/public');
  await page.goto(`/${locale}/login`);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest?lang=en');

  const res = await request.get(href ?? '');
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await res.json()) as { name: string; display: string; start_url: string; icons: { src: string; purpose: string }[] };
  expect(manifest).toMatchObject({ name: school.nameEn, display: 'standalone', start_url: '/en' });
  expect(manifest.icons.map((i) => i.purpose)).toEqual(['any', 'any', 'maskable']);
  for (const icon of manifest.icons) {
    const png = await request.get(icon.src);
    expect(png.status()).toBe(200);
    expect(png.headers()['content-type']).toBe('image/png');
  }
  // The tab and the iOS Home Screen use the same drawn icons.
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /\/files\/app-icon\/apple-touch-icon\.png\?v=/);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', school.nameEn);
});

test('the service worker registers for the whole app; offline, a page shows the branded offline page', async ({ page, context }, info) => {
  await signIn(page, locale);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/');
  // It never stored a page: only the offline pages and static files.
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  expect(cached.every((p) => p === '/offline.html' || p.startsWith('/_next/static/') || p.startsWith('/files/app-icon/'))).toBe(true);

  await context.setOffline(true);
  await page.goto(`/${locale}/employees`).catch(() => undefined);
  await expect(page.getByRole('heading', { name: t(locale, 'common.pwa.offline.title') })).toBeVisible();
  await expect(page.getByRole('button', { name: t(locale, 'common.pwa.offline.retry') })).toBeVisible();
  await shoot(page, info, 'pwa-offline-en-desktop');

  // Back online, Try again loads the page itself — nothing stale was kept.
  await context.setOffline(false);
  await page.getByRole('button', { name: t(locale, 'common.pwa.offline.retry') }).click();
  await expect(page).toHaveURL(/\/en\/employees/);
  await expect(page.getByRole('heading', { name: t(locale, 'common.pwa.offline.title') })).toBeHidden();
});
