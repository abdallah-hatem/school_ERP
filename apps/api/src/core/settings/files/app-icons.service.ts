import { Injectable, Logger } from '@nestjs/common';
import {
  APP_ICON_FOLDER,
  APP_ICONS,
  APP_THEME,
  appIconVersion,
  type AppIconLook,
  type AppIconName,
} from '@school-erp/shared';
import sharp from 'sharp';
import { SettingsService } from '../settings.service';
import { FileStorageService } from './file-storage.service';

/**
 * The generic app icon when the school has no logo: a white mortarboard on a teal disc. A plain,
 * product-neutral mark — never a school's (client material is seed data only).
 */
const GENERIC_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${APP_THEME.themeColor}"/><path fill="#fff" d="M32 15 5 26.5l27 11.5 21-8.95V41h4V26.5L32 15Z"/><path fill="#fff" d="M17 33.6V42c0 3.6 6.7 6.5 15 6.5S47 45.6 47 42v-8.4L32 40 17 33.6Z"/></svg>`;

/** Android's status-bar badge: only its alpha counts, so a white mark on transparent. */
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#fff" d="M32 12 2 25l30 13 23-9.97V43h5V25L32 12Z"/><path fill="#fff" d="M15 33.4V43c0 4 7.6 7.5 17 7.5S49 47 49 43v-9.6L32 41 15 33.4Z"/></svg>`;

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 255, g: 255, b: 255, alpha: 0 };

/** An icon's bytes and the version they were drawn for. */
export interface AppIcon {
  data: Buffer;
  version: string;
}

/** The logo fitted into a `box`-pixel square, transparent around it (SVGs rendered sharp). */
function fitted(logo: Buffer, box: number): Promise<Buffer> {
  return sharp(logo, { density: 384 })
    .resize(box, box, { fit: 'contain', background: CLEAR })
    .png()
    .toBuffer();
}

/**
 * Draws one icon (`APP_ICONS`) from a logo. `plain`: on white, 10% margin; `maskable`: on a white
 * disc (72%) inside a teal square, the logo within the disc — all inside the maskable safe zone
 * (the inner 80%), so any launcher shape keeps it whole; `favicon`: the logo alone; `badge`: the
 * generic white mark. Exported for its tests.
 */
export async function drawAppIcon(logo: Buffer, look: AppIconLook, size: number): Promise<Buffer> {
  if (look === 'badge') {
    return sharp(Buffer.from(BADGE_SVG), { density: 384 }).resize(size, size).png().toBuffer();
  }
  if (look === 'favicon') return fitted(logo, size);
  if (look === 'plain') {
    const box = Math.round(size * 0.8);
    return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
      .composite([{ input: await fitted(logo, box), gravity: 'center' }])
      .png()
      .toBuffer();
  }
  const disc = Math.round(size * 0.72);
  const box = Math.round(disc * 0.68);
  const discSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${disc / 2}" fill="#fff"/></svg>`;
  return sharp({ create: { width: size, height: size, channels: 4, background: APP_THEME.themeColor } })
    .composite([
      { input: Buffer.from(discSvg), gravity: 'center' },
      { input: await fitted(logo, box), gravity: 'center' },
    ])
    .png()
    .toBuffer();
}

/**
 * The installed app's icons, drawn from the school's uploaded logo (owner, 2026-11-21): every size
 * once per logo, kept on disk under `uploads/app-icon/<version>-<name>` (the version is a hash of
 * the logo's URL, `appIconVersion`), so a request reads a file — sharp runs again only for a new
 * logo. Without a logo (or one that can't be read) the generic icon. Icons of older logos are
 * deleted when a new version is first drawn.
 */
@Injectable()
export class AppIconsService {
  private readonly logger = new Logger(AppIconsService.name);
  /** Icons being drawn right now, so two requests at once draw one. */
  private readonly drawing = new Map<string, Promise<Buffer>>();

  constructor(
    private readonly settings: SettingsService,
    private readonly files: FileStorageService,
  ) {}

  /** The current logo's icon `name`, and its version. */
  async icon(name: AppIconName): Promise<AppIcon> {
    const { logoUrl } = await this.settings.getPublicSchoolSettings();
    const version = appIconVersion(logoUrl);
    const file = `${version}-${name}`;
    const stored = await this.files.read(APP_ICON_FOLDER, file);
    if (stored) return { data: stored, version };

    let pending = this.drawing.get(file);
    if (!pending) {
      pending = this.draw(logoUrl, name, version, file).finally(() => this.drawing.delete(file));
      this.drawing.set(file, pending);
    }
    return { data: await pending, version };
  }

  private async draw(
    logoUrl: string | null,
    name: AppIconName,
    version: string,
    file: string,
  ): Promise<Buffer> {
    const { size, look } = APP_ICONS[name];
    const logo = logoUrl ? await this.files.readUrl(logoUrl) : null;
    let data: Buffer;
    try {
      data = await drawAppIcon(logo ?? Buffer.from(GENERIC_LOGO_SVG), look, size);
    } catch (e) {
      // A logo sharp can't read (a broken upload): the generic icon, never an error page.
      this.logger.warn(`app icon ${name}: the logo couldn't be drawn (${(e as Error).message})`);
      data = await drawAppIcon(Buffer.from(GENERIC_LOGO_SVG), look, size);
    }
    await this.files.save(APP_ICON_FOLDER, file, data);
    await this.dropOlderThan(version);
    return data;
  }

  /** Deletes the icons of earlier logos (best effort). */
  private async dropOlderThan(version: string): Promise<void> {
    for (const name of await this.files.list(APP_ICON_FOLDER)) {
      if (!name.startsWith(`${version}-`)) {
        await this.files.remove(FileStorageService.urlFor(APP_ICON_FOLDER, name));
      }
    }
  }
}
