import { ErrorCode } from '@school-erp/shared';
import sharp from 'sharp';
import type { FileStorageService } from './file-storage.service';
import { LegacySvgLogos, legacySvgPngName, logoForStorage, svgToPng, SVG_LOGO_MAX_PX } from './svg-logo';

/*
 * SVG logos are kept only as their picture: converted to PNG on upload, and an SVG stored before
 * that is answered as a PNG drawn on first request (docs/ARCHITECTURE.md → Security).
 */

const svg = (body: string, attrs = 'viewBox="0 0 20 10"') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`);
const BLUE = svg('<rect width="20" height="10" fill="#123456"/>');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function centre(png: Buffer): Promise<number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return [...data.subarray(i, i + 3)];
}

describe('svgToPng', () => {
  it('draws the SVG as a PNG whose longest side is the max, keeping its shape', async () => {
    const png = await svgToPng(BLUE);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: SVG_LOGO_MAX_PX, height: SVG_LOGO_MAX_PX / 2 });
    expect(await centre(png)).toEqual([0x12, 0x34, 0x56]);
  });

  it('a huge declared size is drawn at the max, not at its own size', async () => {
    const png = await svgToPng(svg('<rect width="10" height="10"/>', 'width="20000" height="20000"'));
    expect(await sharp(png).metadata()).toMatchObject({ width: SVG_LOGO_MAX_PX, height: SVG_LOGO_MAX_PX });
  });

  it('script, event handlers, foreignObject and external references leave nothing but pixels', async () => {
    const hostile = svg(
      '<script>alert(1)</script>' +
        '<rect width="20" height="10" fill="#123456" onload="alert(2)"/>' +
        '<foreignObject width="20" height="10"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://example.invalid"/></body></foreignObject>' +
        '<image href="https://example.invalid/track.png" width="1" height="1"/>',
    );
    const png = await svgToPng(hostile);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(png.includes(Buffer.from('alert'))).toBe(false);
    expect(png.includes(Buffer.from('example.invalid'))).toBe(false);
  });

  it('refuses entity declarations (billion laughs) and SVGs without a size', async () => {
    const laughs = Buffer.from(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>&b;</text></svg>',
    );
    await expect(svgToPng(laughs)).rejects.toThrow(/entity/i);
    await expect(svgToPng(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).rejects.toThrow();
  });
});

describe('logoForStorage', () => {
  it('an SVG is stored as its PNG; PNG and JPG pass through untouched', async () => {
    const stored = await logoForStorage({ type: 'svg', buffer: BLUE });
    expect(stored.type).toBe('png');
    expect(stored.buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    const png = { type: 'png' as const, buffer: Buffer.from('x') };
    expect(await logoForStorage(png)).toBe(png);
  });

  it('an SVG that cannot be drawn → 400 INVALID_FILE_TYPE', async () => {
    await expect(
      logoForStorage({ type: 'svg', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_FILE_TYPE, status: 400 });
  });
});

describe('LegacySvgLogos (a logo stored as SVG before conversion)', () => {
  function make(stored: Record<string, Buffer>) {
    const disk = new Map(Object.entries(stored));
    const files = {
      read: jest.fn((_folder: string, name: string) => Promise.resolve(disk.get(name) ?? null)),
      save: jest.fn((_folder: string, name: string, data: Buffer) => {
        disk.set(name, data);
        return Promise.resolve(`/files/logo/${name}`);
      }),
    };
    return { logos: new LegacySvgLogos(files as unknown as FileStorageService), files, disk };
  }

  it('answers a PNG drawn once, then read from disk; the SVG is never sent', async () => {
    const { logos, files, disk } = make({ 'logo-1.svg': BLUE });
    const first = await logos.png('logo', 'logo-1.svg');
    expect(first.getHeaders().type).toBe('image/png');
    expect(files.save).toHaveBeenCalledWith('logo', 'logo-1-svg.png', expect.any(Buffer));
    expect(disk.get('logo-1-svg.png')?.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    await logos.png('logo', 'logo-1.svg');
    expect(files.save).toHaveBeenCalledTimes(1);
  });

  it('a missing or undrawable SVG → 404', async () => {
    const { logos } = make({ 'bad.svg': Buffer.from('<svg/>') });
    await expect(logos.png('logo', 'missing.svg')).rejects.toMatchObject({ status: 404 });
    await expect(logos.png('logo', 'bad.svg')).rejects.toMatchObject({ status: 404 });
  });

  it('names the kept PNG after the SVG', () => {
    expect(legacySvgPngName('logo-6f1c.svg')).toBe('logo-6f1c-svg.png');
  });
});
