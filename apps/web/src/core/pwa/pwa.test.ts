import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_THEME, appIconVersion } from '@school-erp/shared';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const branding = vi.hoisted(() => ({ getSchoolBranding: vi.fn() }));
vi.mock('@/core/settings/get-branding', () => branding);
const apis = vi.hoisted(() => ({ GET_APP_ICON: vi.fn() }));
vi.mock('@/core/pwa/apis', () => apis);

import { GET as manifestRoute } from '@/app/manifest.webmanifest/route';
import { GET as offlineRoute } from '@/app/offline.html/route';
import { alertsSupport, keyBytes, type BrowserEnv } from './browser';
import { manifestFor, manifestPath } from './manifest';
import { offlineHtml } from './offline-page';

/*
 * The installable app (owner, 2026-11-21): the manifest from the school's settings (never a
 * hard-coded school), its fallback, the colours from the design tokens, the offline page, and what
 * a browser can do for alerts.
 */

const SCHOOL = { nameEn: 'Test Academy', nameAr: 'أكاديمية الاختبار', logoUrl: '/files/logo/logo-abc.png' };
const PRODUCT = { nameEn: 'School ERP', nameAr: 'نظام إدارة المدرسة', logoUrl: null };

describe('the manifest', () => {
  afterEach(() => vi.clearAllMocks());

  it('names the app after the school in the language, with the logo’s icons (versioned) and a maskable one', () => {
    const v = appIconVersion(SCHOOL.logoUrl);
    expect(manifestFor(SCHOOL, 'en')).toEqual({
      id: '/',
      name: 'Test Academy',
      short_name: 'Test Academy',
      start_url: '/en',
      scope: '/',
      display: 'standalone',
      background_color: APP_THEME.backgroundColor,
      theme_color: APP_THEME.themeColor,
      lang: 'en',
      dir: 'ltr',
      icons: [
        { src: `/files/app-icon/icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `/files/app-icon/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `/files/app-icon/maskable-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
    expect(manifestFor(SCHOOL, 'ar')).toMatchObject({ name: 'أكاديمية الاختبار', lang: 'ar', dir: 'rtl', start_url: '/ar' });
  });

  it('route: reads the school from settings; ?lang=ar, else the lang cookie, else English', async () => {
    branding.getSchoolBranding.mockResolvedValue(SCHOOL);
    const ar = await manifestRoute(new NextRequest('http://app.test/manifest.webmanifest?lang=ar'));
    expect(ar.headers.get('content-type')).toContain('application/manifest+json');
    expect(await ar.json()).toMatchObject({ name: 'أكاديمية الاختبار', lang: 'ar' });
    const cookie = await manifestRoute(
      new NextRequest('http://app.test/manifest.webmanifest', { headers: { cookie: 'lang=ar' } }),
    );
    expect(await cookie.json()).toMatchObject({ lang: 'ar' });
    const plain = await manifestRoute(new NextRequest('http://app.test/manifest.webmanifest?lang=xx'));
    expect(await plain.json()).toMatchObject({ name: 'Test Academy', lang: 'en' });
  });

  it('route: no school settings (no name, no logo) → the product name and the generic icon', async () => {
    branding.getSchoolBranding.mockResolvedValue(PRODUCT);
    const res = await manifestRoute(new NextRequest('http://app.test/manifest.webmanifest?lang=en'));
    const body = (await res.json()) as { name: string; icons: { src: string }[] };
    expect(body.name).toBe('School ERP');
    expect(body.icons.every((i) => i.src.endsWith('?v=default'))).toBe(true);
  });

  it('the layout links one manifest per language', () => {
    expect(manifestPath('ar')).toBe('/manifest.webmanifest?lang=ar');
  });

  it('the theme colours are the design tokens --primary and --background', () => {
    const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');
    expect(css).toContain(`--primary: ${APP_THEME.themeColor};`);
    expect(css).toContain(`--background: ${APP_THEME.backgroundColor};`);
  });
});

describe('the offline page', () => {
  it('is the school’s, in the language, self-contained, with Try again', () => {
    const html = offlineHtml({ locale: 'ar', schoolName: 'أكاديمية <الاختبار>', iconDataUrl: 'data:image/png;base64,AAAA' });
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('أنت غير متصل');
    expect(html).toContain('حاول مرة أخرى');
    expect(html).toContain('أكاديمية &lt;الاختبار&gt;');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    // Nothing loaded from the network: no external stylesheet, script or image.
    expect(html).not.toMatch(/<link |src="(https?:)?\/[^/]/);
  });

  it('route: inlines the current icon; serves English by default', async () => {
    branding.getSchoolBranding.mockResolvedValue(SCHOOL);
    apis.GET_APP_ICON.mockResolvedValue({ success: true, status: 200, data: { base64: 'QUJD', contentType: 'image/png', fileName: 'i.png' } });
    const res = await offlineRoute(new NextRequest('http://app.test/offline.html'));
    const html = await res.text();
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('You&#39;re offline');
    expect(html).toContain('Test Academy');
    expect(html).toContain('data:image/png;base64,QUJD');
    expect(apis.GET_APP_ICON).toHaveBeenCalledWith('icon-192.png', appIconVersion(SCHOOL.logoUrl));
  });
});

describe('alertsSupport / keyBytes', () => {
  const base = (over: Partial<BrowserEnv> = {}): BrowserEnv => ({
    navigator: { userAgent: 'Chrome', maxTouchPoints: 0, serviceWorker: {} as ServiceWorkerContainer },
    isSecureContext: true,
    matchMedia: () => ({ matches: false }),
    Notification: { permission: 'default', requestPermission: () => Promise.resolve('granted') },
    PushManager: function PushManager() {},
    ...over,
  });

  it('ready; insecure; no service worker; blocked', () => {
    expect(alertsSupport(base())).toBe('ready');
    expect(alertsSupport(base({ isSecureContext: false }))).toBe('insecure');
    expect(alertsSupport(base({ navigator: { userAgent: 'Old', maxTouchPoints: 0 } }))).toBe('unsupported');
    expect(
      alertsSupport(base({ Notification: { permission: 'denied', requestPermission: () => Promise.resolve('denied') } })),
    ).toBe('denied');
  });

  it('decodes a base64url VAPID key', () => {
    expect([...keyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});
