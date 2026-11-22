import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { APP_ICON_FOLDER, isAppIconName, type AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { FileFolders } from './file-folders';
import { LOGO_FOLDER } from '../settings.pure';
import { AppIconsService } from './app-icons.service';
import { FileStorageService } from './file-storage.service';
import { LegacySvgLogos } from './svg-logo';
import { SignedIn } from '../../permissions';

/**
 * Stops a stored file from running script or loading anything when opened directly. Uploaded SVGs
 * are converted to PNG (`svg-logo.ts`), so none is served; the policy stays as a second wall.
 */
const FILE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * Uploaded files. The logo is public (the sign-in page shows it), and so are the app icons drawn
 * from it (the browser fetches them for the manifest and the tab before anyone signs in); every
 * other file needs a session and the right to see its record (`FileFolders`). Routes are matched
 * in order, so the public ones stay first.
 */
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FileStorageService,
    private readonly icons: AppIconsService,
    private readonly legacySvgLogos: LegacySvgLogos,
    private readonly folders: FileFolders,
  ) {}

  @Public()
  @Get(`${LOGO_FOLDER}/:name`)
  @Header('Content-Security-Policy', FILE_CSP)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=86400')
  logo(@Param('name') name: string): Promise<StreamableFile> {
    // A logo stored as SVG before uploads were converted is answered as its PNG (`svg-logo.ts`).
    if (/\.svg$/i.test(name)) return this.legacySvgLogos.png(LOGO_FOLDER, name);
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

  /**
   * Any other stored file: it opens for whoever may see the record it belongs to — the folder's
   * owner decides (`FileFolders`; an employee photo follows `hr.employees.view` and its scope).
   * An unknown folder, a file of a record outside the user's view, or a missing file → 404 alike.
   */
  @Get(':folder/:name')
  @SignedIn()
  @Header('Content-Security-Policy', FILE_CSP)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('folder') folder: string,
    @Param('name') name: string,
  ): Promise<StreamableFile> {
    await this.folders.assertCanOpen(user, folder, name);
    return this.files.open(folder, name);
  }
}
