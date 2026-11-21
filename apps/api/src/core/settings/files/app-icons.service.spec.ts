import { APP_ICONS, APP_ICON_NAMES, appIconVersion } from '@school-erp/shared';
import sharp from 'sharp';
import type { SettingsService } from '../settings.service';
import { AppIconsService, drawAppIcon } from './app-icons.service';
import type { FileStorageService } from './file-storage.service';

/*
 * The installed app's icons, drawn from the school's logo (owner, 2026-11-21): every size from
 * `APP_ICONS`, drawn once per logo and then read from disk; the generic icon without a logo.
 * The logo here is a generic red square, never a school's.
 */

const LOGO_URL = '/files/logo/logo-test.png';

async function testLogo(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 150, channels: 4, background: '#d33' } }).png().toBuffer();
}

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [...data.subarray(i, i + info.channels)];
}

function make(logoUrl: string | null, logo: Buffer | null) {
  const disk = new Map<string, Buffer>();
  const files = {
    read: jest.fn((_folder: string, name: string) => Promise.resolve(disk.get(name) ?? null)),
    readUrl: jest.fn(() => Promise.resolve(logo)),
    save: jest.fn((_folder: string, name: string, data: Buffer) => {
      disk.set(name, data);
      return Promise.resolve(`/files/app-icon/${name}`);
    }),
    list: jest.fn(() => Promise.resolve([...disk.keys()])),
    remove: jest.fn((url: string) => {
      disk.delete(url.split('/').pop() ?? '');
      return Promise.resolve();
    }),
  };
  const settings = { getPublicSchoolSettings: jest.fn(() => Promise.resolve({ logoUrl })) };
  const service = new AppIconsService(
    settings as unknown as SettingsService,
    files as unknown as FileStorageService,
  );
  return { service, files, settings, disk };
}

describe('drawAppIcon', () => {
  it.each(APP_ICON_NAMES)('%s is a PNG of its size', async (name) => {
    const { size, look } = APP_ICONS[name];
    const png = await drawAppIcon(await testLogo(), look, size);
    expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: size, height: size });
  });

  it('plain: white margin around the logo; maskable: teal corners, the logo in the middle', async () => {
    const logo = await testLogo();
    const plain = await drawAppIcon(logo, 'plain', 192);
    expect((await pixel(plain, 2, 2)).slice(0, 3)).toEqual([255, 255, 255]);
    expect((await pixel(plain, 96, 96)).slice(0, 3)).toEqual([0xdd, 0x33, 0x33]);
    const maskable = await drawAppIcon(logo, 'maskable', 512);
    expect((await pixel(maskable, 4, 4)).slice(0, 3)).toEqual([0x0b, 0x7a, 0x68]);
    expect((await pixel(maskable, 256, 256)).slice(0, 3)).toEqual([0xdd, 0x33, 0x33]);
  });

  it('an SVG logo is drawn too', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123456"/></svg>');
    const png = await drawAppIcon(svg, 'plain', 192);
    expect((await pixel(png, 96, 96)).slice(0, 3)).toEqual([0x12, 0x34, 0x56]);
  });
});

describe('AppIconsService', () => {
  it('draws an icon once per logo, then reads it from disk under the logo’s version', async () => {
    const { service, files } = make(LOGO_URL, await testLogo());
    const first = await service.icon('icon-512.png');
    expect(first.version).toBe(appIconVersion(LOGO_URL));
    expect(files.save).toHaveBeenCalledWith('app-icon', `${first.version}-icon-512.png`, first.data);
    const again = await service.icon('icon-512.png');
    expect(again.data.equals(first.data)).toBe(true);
    expect(files.save).toHaveBeenCalledTimes(1);
  });

  it('two requests at once draw it once', async () => {
    const { service, files } = make(LOGO_URL, await testLogo());
    await Promise.all([service.icon('icon-192.png'), service.icon('icon-192.png')]);
    expect(files.save).toHaveBeenCalledTimes(1);
  });

  it('no logo → the generic icon, version "default"', async () => {
    const { service, files } = make(null, null);
    const icon = await service.icon('maskable-512.png');
    expect(icon.version).toBe('default');
    expect(files.readUrl).not.toHaveBeenCalled();
    expect((await pixel(icon.data, 4, 4)).slice(0, 3)).toEqual([0x0b, 0x7a, 0x68]);
  });

  it('a logo that can’t be read as an image → the generic icon, not an error', async () => {
    const { service } = make(LOGO_URL, Buffer.from('not an image'));
    const icon = await service.icon('icon-192.png');
    expect(await sharp(icon.data).metadata()).toMatchObject({ width: 192 });
  });

  it('a new logo’s first icon deletes the old logo’s icons', async () => {
    const { service, disk, settings } = make(LOGO_URL, await testLogo());
    await service.icon('icon-192.png');
    settings.getPublicSchoolSettings.mockResolvedValue({ logoUrl: '/files/logo/logo-new.png' });
    await service.icon('icon-192.png');
    expect([...disk.keys()]).toEqual([`${appIconVersion('/files/logo/logo-new.png')}-icon-192.png`]);
  });
});
