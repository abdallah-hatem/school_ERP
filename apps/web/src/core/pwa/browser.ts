import { PUSH_ENDPOINT_HASH_LENGTH } from '@school-erp/shared';

/*
 * What this browser can do for the installed app and its alerts — read from the browser, so these
 * run only on the client. Each takes the globals it reads (`env`) so the tests can stand in for any
 * browser: an iPhone not yet added to the Home Screen, a browser with alerts blocked, an old one.
 */

export interface BrowserEnv {
  navigator: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { serviceWorker?: ServiceWorkerContainer; standalone?: boolean };
  isSecureContext: boolean;
  matchMedia?: (query: string) => { matches: boolean };
  Notification?: { permission: NotificationPermission; requestPermission: () => Promise<NotificationPermission> };
  PushManager?: unknown;
}

export const browserEnv = (): BrowserEnv => window as unknown as BrowserEnv;

/** iPhone, iPad (also iPadOS, which says "Macintosh" but has touch). */
export function isIos(env: BrowserEnv): boolean {
  const ua = env.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.navigator.maxTouchPoints > 1);
}

/** Running as the installed app (from the Home Screen / dock), not in a browser tab. */
export function isStandalone(env: BrowserEnv): boolean {
  return env.navigator.standalone === true || env.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * Where "Alerts on this device" stands before the server is asked:
 * - `insecure`: not https (nor localhost) — browsers allow no service worker;
 * - `ios-install`: an iPhone / iPad in Safari — Web Push works only from the Home Screen app (16.4+);
 * - `unsupported`: no service worker, Push API or notifications in this browser;
 * - `denied`: the person blocked notifications for the site;
 * - `ready`: the switch can be used (permission granted or not asked yet).
 */
export type AlertsSupport = 'insecure' | 'ios-install' | 'unsupported' | 'denied' | 'ready';

export function alertsSupport(env: BrowserEnv): AlertsSupport {
  if (!env.isSecureContext) return 'insecure';
  if (isIos(env) && !isStandalone(env)) return 'ios-install';
  if (!env.navigator.serviceWorker || env.PushManager === undefined || !env.Notification) return 'unsupported';
  if (env.Notification.permission === 'denied') return 'denied';
  return 'ready';
}

/** A base64url VAPID key as the bytes `pushManager.subscribe` wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The SHA-256 of an endpoint as the API lists it (`PushDevice.endpointHash`): "This device". */
export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, PUSH_ENDPOINT_HASH_LENGTH);
}

/** This browser's push subscription, if it has one (the service worker must be registered). */
export async function currentSubscription(env: BrowserEnv = browserEnv()): Promise<PushSubscription | null> {
  const sw = env.navigator.serviceWorker;
  if (!sw) return null;
  const registration = await sw.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Asks for permission (on the person's tap) and subscribes this browser with the server's key.
 * Resolves to the subscription, or to why not: `denied` (they said no), `failed` (anything else).
 */
export async function subscribeThisBrowser(
  publicKey: string,
  env: BrowserEnv = browserEnv(),
): Promise<PushSubscription | 'denied' | 'failed'> {
  try {
    const permission = await env.Notification?.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'failed';
    const sw = env.navigator.serviceWorker;
    if (!sw) return 'failed';
    const registration = (await sw.getRegistration()) ?? (await sw.register('/sw.js', { scope: '/' }));
    await sw.ready;
    const existing = await registration.pushManager.getSubscription();
    return (
      existing ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
    );
  } catch {
    return 'failed';
  }
}

/** The subscription's endpoint and keys, as the API takes them. */
export function subscriptionBody(subscription: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return json.endpoint && p256dh && auth ? { endpoint: json.endpoint, keys: { p256dh, auth } } : null;
}
