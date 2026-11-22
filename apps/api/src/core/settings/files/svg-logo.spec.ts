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

  it('keeps the artwork: gradients, <defs>/<use>, viewBox only — many colours, each shape where it was', async () => {
    // A generic logo (not a school's): a sun over waves on a teal tile, the way real logos are
    // drawn — a gradient from <defs>, a shape reused with <use>, size from the viewBox alone.
    const artwork = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">' +
        '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b7a68"/><stop offset="1" stop-color="#5fb3a3"/></linearGradient>' +
        '<path id="wave" d="M0 0 q12.5 -8 25 0 t25 0 t25 0 t25 0 v12 h-100z" fill="#ffffff"/></defs>' +
        '<rect width="100" height="100" rx="16" fill="url(#sky)"/>' +
        '<circle cx="50" cy="38" r="18" fill="#f5b820"/>' +
        '<use xlink:href="#wave" y="70"/><use href="#wave" y="84" opacity="0.6"/></svg>',
    );
    const png = await svgToPng(artwork);
    expect(await sharp(png).metadata()).toMatchObject({ width: SVG_LOGO_MAX_PX, height: SVG_LOGO_MAX_PX });

    // Not one flat colour: every channel varies across the picture.
    const { channels } = await sharp(png).stats();
    for (const c of channels.slice(0, 3)) expect(c.stdev).toBeGreaterThan(20);

    const at = async (x: number, y: number) => {
      const s = SVG_LOGO_MAX_PX / 100;
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      const i = (Math.round(y * s) * info.width + Math.round(x * s)) * info.channels;
      return [...data.subarray(i, i + 3)];
    };
    const near = (actual: number[], expected: number[]) =>
      actual.forEach((v, i) => expect(Math.abs(v - (expected[i] ?? 0))).toBeLessThanOrEqual(12));
    near(await at(50, 38), [0xf5, 0xb8, 0x20]); // the sun
    near(await at(50, 76), [0xff, 0xff, 0xff]); // the first wave (from <use>)
    near(await at(10, 8), [0x0e, 0x7d, 0x6b]); // the gradient's top, nearly #0b7a68
    const lower = await at(90, 62); // further down the gradient: lighter than the top
    expect(lower[1] ?? 0).toBeGreaterThan(0x7d + 30);
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
