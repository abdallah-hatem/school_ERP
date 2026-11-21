import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { APP_ICON_FOLDER, isAppIconName } from '@school-erp/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { LOGO_FOLDER } from '../settings.pure';
import { AppIconsService } from './app-icons.service';
import { FileStorageService } from './file-storage.service';
import { SignedIn } from '../../permissions';

/** Stops an uploaded SVG from running script or loading anything when opened directly. */
const FILE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * Uploaded files. The logo is public (the sign-in page shows it), and so are the app icons drawn
 * from it (the browser fetches them for the manifest and the tab before anyone signs in); every
 * other file needs a session (contract). Routes are matched in order, so the public ones stay first.
 */
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FileStorageService,
    private readonly icons: AppIconsService,
  ) {}

  @Public()
  @Get(`${LOGO_FOLDER}/:name`)
  @Header('Content-Security-Policy', FILE_CSP)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=86400')
  logo(@Param('name') name: string): Promise<StreamableFile> {
    return this.files.open(LOGO_FOLDER, name);
  }

  /**
   * The installed app's icons (`APP_ICONS`), drawn from the current logo once and kept on disk.
   * Every URL carries the logo's version (`appIconPath`: `?v=`), and a new logo has new URLs, so a
   * response may be kept for a year (browsers, Cloudflare). No version → 404: an unversioned URL
   * could be cached with an old logo. An old version gets today's icon (a stale manifest).
   */
  @Public()
  @Get(`${APP_ICON_FOLDER}/:name`)
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async appIcon(
    @Param('name') name: string,
    @Query('v') version: string | undefined,
  ): Promise<StreamableFile> {
    if (!isAppIconName(name) || !version) throw new NotFoundException();
    const icon = await this.icons.icon(name);
    return new StreamableFile(icon.data, { type: 'image/png', length: icon.data.length });
  }

  @Get(':folder/:name')
  @SignedIn()
  @Header('Content-Security-Policy', FILE_CSP)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  file(@Param('folder') folder: string, @Param('name') name: string): Promise<StreamableFile> {
    if (folder === APP_ICON_FOLDER) throw new NotFoundException();
    return this.files.open(folder, name);
  }
}
