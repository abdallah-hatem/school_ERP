import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import type {
  AuthUser,
  PublicSchoolSettings,
  SchoolSettings,
  UploadLogoResponse,
} from '@school-erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/rate-limit';
import { Audited } from '../audit';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { LogoUploadInterceptor } from './files/logo-upload.interceptor';
import { SettingsService, type UploadedFileLike } from './settings.service';
import { Permission } from '../permissions';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public: the sign-in page shows the school's name and logo before anyone signs in. */
  @Public()
  @Get('school/public')
  getPublicSchool(): Promise<PublicSchoolSettings> {
    return this.settings.getPublicSchoolSettings();
  }

  @Get('school')
  @Permission('core.settings.view')
  getSchool(): Promise<SchoolSettings> {
    return this.settings.getSchoolSettings();
  }

  @Patch('school')
  @Permission('core.settings.edit')
  @Audited('core.settings.update')
  updateSchool(
    @Body() dto: UpdateSchoolSettingsDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<SchoolSettings> {
    return this.settings.updateSchoolSettings(dto, user?.id ?? null);
  }

  @Post('school/logo')
  @RateLimit('heavy')
  @Permission('core.settings.edit')
  @Audited('core.settings.logo_change')
  @UseInterceptors(LogoUploadInterceptor)
  uploadLogo(
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<UploadLogoResponse> {
    return this.settings.setLogo(file, user?.id ?? null);
  }
}
