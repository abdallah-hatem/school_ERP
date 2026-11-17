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
  type SchoolSettings,
  type SettingChangeItem,
  type UploadLogoResponse,
} from '@school-erp/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { LogoUploadInterceptor } from './files/logo-upload.interceptor';
import { SettingsService, type UploadedFileLike } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('school')
  getSchool(): Promise<SchoolSettings> {
    return this.settings.getSchoolSettings();
  }

  @Patch('school')
  updateSchool(
    @Body() dto: UpdateSchoolSettingsDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<SchoolSettings> {
    return this.settings.updateSchoolSettings(dto, user?.id ?? null);
  }

  @Post('school/logo')
  @UseInterceptors(LogoUploadInterceptor)
  uploadLogo(
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<UploadLogoResponse> {
    return this.settings.setLogo(file, user?.id ?? null);
  }

  @Get('history')
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
