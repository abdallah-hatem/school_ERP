import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { LOGO_FOLDER } from '../settings.pure';
import { FileStorageService } from './file-storage.service';
import { SignedIn } from '../../permissions';

/** Stops an uploaded SVG from running script or loading anything when opened directly. */
const FILE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * Uploaded files. The logo is public (the sign-in page shows it); every other file needs a session
 * (contract). Routes are matched in order, so the logo route must stay first.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FileStorageService) {}

  @Public()
  @Get(`${LOGO_FOLDER}/:name`)
  @Header('Content-Security-Policy', FILE_CSP)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=86400')
  logo(@Param('name') name: string): Promise<StreamableFile> {
    return this.files.open(LOGO_FOLDER, name);
  }

  @Get(':folder/:name')
  @SignedIn()
  @Header('Content-Security-Policy', FILE_CSP)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  file(@Param('folder') folder: string, @Param('name') name: string): Promise<StreamableFile> {
    return this.files.open(folder, name);
  }
}
