import type { IsoDateTime, Uuid } from './types/common';

/*
 * The installable app (PWA) and push notifications (owner, 2026-11-21; §11 → Push, docs/ARCHITECTURE.md
 * → Installable app and push). The app's icon is the school's uploaded logo: the API draws every
 * size from it once per logo (`/files/app-icon/<name>`) and falls back to a generic icon without one.
 */

/** Theme colours of the installed app — the design tokens `--primary` and `--background` (globals.css). */
export const APP_THEME = { themeColor: '#0b7a68', backgroundColor: '#f2f8f6' } as const;

/**
 * Every icon the API draws from the logo. `plain`: the logo on white with a margin (the manifest's
 * `any` icons); `maskable`: the logo on a white disc inside a teal square, all of it inside the
 * maskable safe zone (also the Apple touch icon, which iOS never shows transparent); `favicon`: the
 * logo alone; `badge`: a generic white glyph on transparent (Android's monochrome status-bar badge).
 */
export const APP_ICONS = {
  'icon-192.png': { size: 192, look: 'plain' },
  'icon-512.png': { size: 512, look: 'plain' },
  'maskable-512.png': { size: 512, look: 'maskable' },
  'apple-touch-icon.png': { size: 180, look: 'maskable' },
  'favicon-32.png': { size: 32, look: 'favicon' },
  'badge-96.png': { size: 96, look: 'badge' },
} as const satisfies Record<string, { size: number; look: 'plain' | 'maskable' | 'favicon' | 'badge' }>;
export type AppIconName = keyof typeof APP_ICONS;
export type AppIconLook = (typeof APP_ICONS)[AppIconName]['look'];
export const APP_ICON_NAMES = Object.keys(APP_ICONS) as AppIconName[];

export function isAppIconName(value: unknown): value is AppIconName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(APP_ICONS, value);
}

/** The folder of `/files/<folder>/<name>` the icons are served under. */
export const APP_ICON_FOLDER = 'app-icon';

/** The version of the icons without a logo (the generic icon). */
export const APP_ICON_DEFAULT_VERSION = 'default';

/**
 * The icons' version: a short hash of the logo's URL (every upload gets a new file name), so a new
 * logo gets new icon URLs and browsers and Cloudflare may keep each version forever. Same value on
 * both sides: the web app puts it in the URLs, the API decides from it how long a response may be kept.
 */
export function appIconVersion(logoUrl: string | null | undefined): string {
  if (!logoUrl) return APP_ICON_DEFAULT_VERSION;
  // FNV-1a, 32 bits: stable, tiny, no crypto needed (it only has to change when the URL does).
  let hash = 0x811c9dc5;
  for (let i = 0; i < logoUrl.length; i++) {
    hash ^= logoUrl.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** `/files/app-icon/icon-192.png?v=1a2b3c4d` — one icon of the current logo. */
export function appIconPath(name: AppIconName, logoUrl: string | null | undefined): string {
  return `/files/${APP_ICON_FOLDER}/${name}?v=${appIconVersion(logoUrl)}`;
}

// ── Push (Web Push, VAPID) ─────────────────────────────────────────────────

/** One device that gets alerts (a browser or an installed app on one phone or computer). */
export interface PushDevice {
  id: Uuid;
  /** "Chrome", "Safari"… — worked out from the browser when it was added; null: not recognised. */
  browser: string | null;
  /** "Android", "iPhone", "macOS"…; null: not recognised. The screen reads "Chrome on Android". */
  os: string | null;
  createdAt: IsoDateTime;
  /** The last alert it was sent; null: none yet. */
  lastUsedAt: IsoDateTime | null;
  /**
   * The SHA-256 of its push endpoint, hex, first `PUSH_ENDPOINT_HASH_LENGTH` characters: the
   * browser hashes its own endpoint to find "This device" without the API handing endpoints out.
   */
  endpointHash: string;
}

export const PUSH_ENDPOINT_HASH_LENGTH = 32;

/** `GET /notifications/push-devices`: whether this server sends alerts, its key, and my devices. */
export interface PushDevices {
  /** False when the server has no VAPID keys: the switch explains alerts aren't set up yet. */
  available: boolean;
  /** The VAPID public key (base64url) the browser subscribes with; null when not available. */
  publicKey: string | null;
  devices: PushDevice[];
}

/** At most this many devices per person; adding one more removes the one unused longest. */
export const PUSH_DEVICES_MAX = 20;

/**
 * What the service worker receives and shows. The sentence the bell shows, in the device's
 * language — never a salary or any other money (owner, 2026-11-21) — and the page it opens.
 */
export interface PushMessage {
  title: string;
  body: string | null;
  /** The page a tap opens, under the locale (`/en/penalties?penalty=…`). */
  url: string;
  /** One notification on the device per bell notification: a group's next item replaces it. */
  tag: string;
  icon: string;
  badge: string;
  lang: 'en' | 'ar';
  dir: 'ltr' | 'rtl';
  /** When it happened (ms since the epoch). */
  timestamp: number;
}
