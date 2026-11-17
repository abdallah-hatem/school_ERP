import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  PAGINATION,
  type ApiResponse,
  type AuthUser,
  type PublicSchoolSettings,
  type SchoolSettings,
  type SettingChangeItem,
  type UploadLogoResponse,
} from '@school-erp/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ResponseUtil } from '../../common/utils/response.util';
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
  @Permission('core.settings.edit')
  @Audited('core.settings.logo_change')
  @UseInterceptors(LogoUploadInterceptor)
  uploadLogo(
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<UploadLogoResponse> {
    return this.settings.setLogo(file, user?.id ?? null);
  }

  @Get('history')
  @Permission('core.settings.view')
  async history(
    @Query() query: PaginationQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<SettingChangeItem[]>> {
    const page = await this.settings.listHistory(
      query.page ?? PAGINATION.defaultPage,
      query.limit ?? PAGINATION.defaultLimit,
    );
    return ResponseUtil.paginated(page, undefined, req.url);
  }
}
