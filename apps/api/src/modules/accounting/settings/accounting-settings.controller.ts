import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { AccountingSettings, AuthUser } from '@school-erp/shared';
import { Audited } from '../../../core/audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permission } from '../../../core/permissions';
import { AccountingSettingsService } from './accounting-settings.service';
import { UpdateAccountingSettingsDto } from './dto/update-accounting-settings.dto';

/** `/accounting/settings` — accounting's rule settings (§10): the payroll tax rule. */
@Controller('accounting/settings')
export class AccountingSettingsController {
  constructor(private readonly settings: AccountingSettingsService) {}

  @Get()
  @Permission('accounting.settings.view')
  get(): Promise<AccountingSettings> {
    return this.settings.get();
  }

  @Patch()
  @Audited('accounting.settings.update')
  @Permission('accounting.settings.edit')
  update(
    @Body() dto: UpdateAccountingSettingsDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<AccountingSettings> {
    return this.settings.update(dto, user?.id ?? null);
  }
}
