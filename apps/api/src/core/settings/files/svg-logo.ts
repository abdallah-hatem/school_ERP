import { HttpStatus, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ErrorCode } from '@school-erp/shared';
import sharp from 'sharp';
import { CodedException } from '../../../common/errors/coded.exception';
import type { ImageType } from '../settings.pure';
import { FileStorageService } from './file-storage.service';

/*
 * SVG logos are converted to PNG when they arrive (docs/ARCHITECTURE.md → Security). An SVG is a
 * document — it can carry script, event handlers, `foreignObject` HTML and references to other
 * URLs — and nothing in the app needs the vector: the sign-in page shows it at a few hundred
 * pixels and the app icons are drawn from it as PNGs. So we never store or serve an uploaded SVG;
 * we keep only the picture. librsvg (inside sharp) draws shapes and text only: it runs no script
 * and loads no external file or URL.
 */

/** The longest side of a logo drawn from an SVG, in pixels: sharp enough for every icon (512). */
export const SVG_LOGO_MAX_PX = 1024;

/** sharp's highest density; an SVG declared smaller than ~1px wide just comes out smaller. */
const MAX_DENSITY = 100_000;

/** An SVG that declares entities (the "billion laughs" shape) is refused before it is parsed. */
const ENTITY_DECLARATION = /<!ENTITY/i;

/**
 * The SVG drawn as a PNG whose longest side is `SVG_LOGO_MAX_PX` (never enlarged past what the
 * SVG asks for at that size). Throws when the SVG declares entities or can't be drawn (no size,
 * broken XML) — the caller answers that as an invalid file.
 */
export async function svgToPng(svg: Buffer): Promise<Buffer> {
  if (ENTITY_DECLARATION.test(svg.toString('utf8'))) throw new Error('SVG entity declarations are not allowed');
  // Only the declared size is read here (nothing is drawn), so a huge one isn't refused yet: it is
  // drawn below at the density that brings it down to the max.
  const { width = 0, height = 0 } = await sharp(svg, { limitInputPixels: false }).metadata();
  const longest = Math.max(width, height);
  if (!longest) throw new Error('SVG has no size');
  // metadata() reads the SVG at 72 dpi: pick the density that draws its longest side at the max.
  const density = Math.min(MAX_DENSITY, Math.max(1, (72 * SVG_LOGO_MAX_PX) / longest));
  return sharp(svg, { density })
    .resize(SVG_LOGO_MAX_PX, SVG_LOGO_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * The name of the PNG kept for a logo stored as SVG before uploads were converted
 * (`logo-<id>.svg` → `logo-<id>-svg.png`), so that logo keeps working without being served as SVG.
 */
export function legacySvgPngName(svgName: string): string {
  return svgName.replace(/\.svg$/i, '-svg.png');
}

/**
 * A checked logo upload as it is stored: an SVG becomes its PNG; PNG and JPG stay as they are.
 * An SVG that can't be drawn → 400 `INVALID_FILE_TYPE`, like any other file that isn't an image.
 */
export async function logoForStorage(upload: {
  type: ImageType;
  buffer: Buffer;
}): Promise<{ type: ImageType; buffer: Buffer }> {
  if (upload.type !== 'svg') return upload;
  try {
    return { type: 'png', buffer: await svgToPng(upload.buffer) };
  } catch {
    throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_FILE_TYPE);
  }
}

/**
 * Logos stored as SVG before uploads were converted (lazy conversion): the first request draws
 * the PNG and keeps it next to the SVG (`legacySvgPngName`); every request then answers that PNG.
 * The SVG itself is never served again. A new upload replaces the logo with a PNG for good.
 */
@Injectable()
export class LegacySvgLogos {
  constructor(private readonly files: FileStorageService) {}

  async png(folder: string, svgName: string): Promise<StreamableFile> {
    const pngName = legacySvgPngName(svgName);
    let png = await this.files.read(folder, pngName);
    if (!png) {
      const svg = await this.files.read(folder, svgName);
      if (!svg) throw new NotFoundException();
      png = await svgToPng(svg).catch(() => null);
      if (!png) throw new NotFoundException();
      await this.files.save(folder, pngName, png);
    }
    return new StreamableFile(png, { type: 'image/png', length: png.length });
  }
}
