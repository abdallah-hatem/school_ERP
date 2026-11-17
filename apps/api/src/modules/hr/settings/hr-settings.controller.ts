import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { AuthUser, HrSettings } from '@school-erp/shared';
import type { Request } from 'express';
import { UpdateHrSettingsDto } from './dto/update-hr-settings.dto';
import { HrSettingsService } from './hr-settings.service';
import { NotAudited } from '../../../core/audit';

/** `/hr/settings` — HR rule settings (contract: "HR rule settings — hr"). Signed-in users only. */
@Controller('hr/settings')
export class HrSettingsController {
  constructor(private readonly settings: HrSettingsService) {}

  @Get()
  get(): Promise<HrSettings> {
    return this.settings.get();
  }

  @NotAudited('wired in T28')
  @Patch()
  update(@Body() dto: UpdateHrSettingsDto, @Req() req: Request): Promise<HrSettings> {
    // The user comes from the token (the global JWT guard), never from the body.
    const user: Partial<AuthUser> | undefined = req.user;
    return this.settings.update(dto, user?.id ?? null);
  }
}
