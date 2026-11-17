import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A folder or file name we accept in a `/files/<folder>/<name>` path — no traversal possible. */
const SAFE_FOLDER = /^[a-z0-9-]{1,40}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.[a-z0-9]{1,5}$/;

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

/**
 * Files on local disk under `UPLOADS_DIR`, laid out as `<folder>/<name>` and served at
 * `/files/<folder>/<name>`.
 */
@Injectable()
export class FileStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('uploadsDir'));
  }

  /** Public URL path of a stored file. */
  static urlFor(folder: string, name: string): string {
    return `/files/${folder}/${name}`;
  }

  async save(folder: string, name: string, data: Buffer): Promise<string> {
    const path = this.pathFor(folder, name);
    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(path, data);
    return FileStorageService.urlFor(folder, name);
  }

  /** The stored file as a download, or 404 for a bad or missing name. */
  async open(folder: string, name: string): Promise<StreamableFile> {
    const path = this.pathFor(folder, name);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException();
    return new StreamableFile(createReadStream(path), {
      type: CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream',
      length: info.size,
    });
  }

  private pathFor(folder: string, name: string): string {
    if (!SAFE_FOLDER.test(folder) || !SAFE_NAME.test(name)) throw new NotFoundException();
    const path = resolve(this.root, folder, name);
    // Belt and braces: the regexes already forbid separators and dots-only names.
    if (!path.startsWith(this.root + sep)) throw new NotFoundException();
    return path;
  }
}
