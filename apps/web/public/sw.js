/*
 * The app's service worker (owner, 2026-11-21; docs/ARCHITECTURE.md → Installable app and push).
 *
 * Caching — every page is per user (CLAUDE.md rule 7), so:
 *   - pages (navigations): always from the network; only when the network fails, the branded
 *     offline page of the visitor's language. A page's response is never stored.
 *   - API calls, server actions, anything not a GET: never touched.
 *   - static files only, cache-first: Next's build output (`/_next/static/`, content-hashed, fonts
 *     included) and the app icons (`/files/app-icon/…?v=<logo version>`). Their URLs change with
 *     their content, so a stored copy is never stale.
 *
 * Updates: a new sw.js (a deploy that changed it) installs in the background and activates at once
 * (skipWaiting) without taking over open tabs (no clients.claim): the next page load runs on it.
 * Nothing it stores can go stale, so there is no old shell to serve.
 *
 * Push: shows the alert the API sent (title, body, icon, the page to open — the bell's sentence,
 * never money) and, on a tap, focuses an open window of the app on that page or opens one.
 */

const VERSION = 'v1';
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_CACHE = `offline-${VERSION}`;
const LOCALES = ['en', 'ar'];
const offlineUrl = (locale) => `/offline.html?lang=${locale}`;
/** Static files kept at most: the oldest go first (builds pile up hashed files). */
const STATIC_MAX = 300;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(LOCALES.map(offlineUrl)))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, OFFLINE_CACHE]);
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name);
      }
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    })(),
  );
});

function isStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      (url.pathname.startsWith('/files/app-icon/') && url.searchParams.has('v')))
  );
}

function localeOf(url) {
  const first = url.pathname.split('/')[1];
  return LOCALES.includes(first) ? first : 'en';
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_MAX; i++) await cache.delete(keys[i]);
}

async function fromCacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    void trim(cache);
  }
  return response;
}

async function page(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(offlineUrl(localeOf(new URL(event.request.url))), {
      cacheName: OFFLINE_CACHE,
    });
    return offline ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(page(event));
    return;
  }
  const url = new URL(request.url);
  if (isStatic(url)) event.respondWith(fromCacheFirst(request));
  // Everything else goes to the network as if there were no service worker.
});

self.addEventListener('push', (event) => {
  let message = null;
  try {
    message = event.data ? event.data.json() : null;
  } catch {
    message = null;
  }
  if (!message || typeof message.title !== 'string') return;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body || undefined,
      icon: message.icon,
      badge: message.badge,
      tag: message.tag,
      renotify: Boolean(message.tag),
      lang: message.lang,
      dir: message.dir,
      timestamp: message.timestamp,
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        try {
          await open.focus();
          // Only a window this worker controls can be navigated; otherwise open a new one.
          if (await open.navigate(target.href)) return undefined;
        } catch {
          // fall through
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
