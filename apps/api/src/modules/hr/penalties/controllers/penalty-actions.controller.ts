import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';
import {
  CreatePenaltyActionDto,
  ListPenaltyActionsQueryDto,
  UpdatePenaltyActionDto,
  wantsActionsPage,
} from '../dto/penalty-action.dto';
import { PenaltyActionsService } from '../services/penalty-actions.service';

/**
 * `/hr/penalty-actions` (spec 2026-11-25) — GET, POST, PATCH :id. No DELETE: an action is hidden
 * (`isActive: false`), and the foreign keys from levels and penalties are RESTRICT. Managed with the
 * catalogue (`hr.penalty_catalogue.manage`), seen by whoever sees it (`.view`).
 */
@Controller('hr/penalty-actions')
export class PenaltyActionsController {
  constructor(private readonly actions: PenaltyActionsService) {}

  @Get()
  @Permission('hr.penalty_catalogue.view')
  async list(@Query() query: ListPenaltyActionsQueryDto) {
    // A page (Settings) or the whole visible list (the level editor's picker).
    if (wantsActionsPage(query)) return ResponseUtil.paginated(await this.actions.page(query));
    return this.actions.list(query.includeHidden);
  }

  @Audited('hr.penalty_action.create')
  @Post()
  @Permission('hr.penalty_catalogue.manage')
  create(@Body() dto: CreatePenaltyActionDto, @CurrentUser() user?: AuthUser) {
    return this.actions.create(dto, user?.id ?? null);
  }

  @Audited('hr.penalty_action.update')
  @Patch(':id')
  @Permission('hr.penalty_catalogue.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePenaltyActionDto, @CurrentUser() user?: AuthUser) {
    return this.actions.update(id, dto, user?.id ?? null);
  }
}
