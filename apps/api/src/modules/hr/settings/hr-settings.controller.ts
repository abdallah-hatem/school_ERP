import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { AuthUser, HrSettings } from '@school-erp/shared';
import type { Request } from 'express';
import { UpdateHrSettingsDto } from './dto/update-hr-settings.dto';
import { HrSettingsService } from './hr-settings.service';

/** `/hr/settings` — HR rule settings (contract: "HR rule settings — hr"). Signed-in users only. */
@Controller('hr/settings')
export class HrSettingsController {
  constructor(private readonly settings: HrSettingsService) {}

  @Get()
  get(): Promise<HrSettings> {
    return this.settings.get();
  }

  @Patch()
  update(@Body() dto: UpdateHrSettingsDto, @Req() req: Request): Promise<HrSettings> {
    // The user comes from the token (the global JWT guard), never from the body.
    const user: Partial<AuthUser> | undefined = req.user;
    return this.settings.update(dto, user?.id ?? null);
  }
}
