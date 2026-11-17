import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import {
  CreatePenaltyGroupDto,
  CreateViolationDto,
  UpdatePenaltyGroupDto,
  UpdateViolationDto,
} from '../dto/catalogue.dto';
import { PenaltyCatalogueService } from '../services/penalty-catalogue.service';
import { NotAudited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/**
 * Penalty catalogue (contract: "Penalty catalogue — hr"). No DELETE routes: groups and violations
 * are retired with `isActive: false` (§7).
 */
@Controller('hr')
export class PenaltyCatalogueController {
  constructor(private readonly catalogue: PenaltyCatalogueService) {}

  @Get('penalty-groups')
  @Permission('hr.penalty_catalogue.view')
  list() {
    return this.catalogue.list();
  }

  @NotAudited('wired in T28')
  @Post('penalty-groups')
  @Permission('hr.penalty_catalogue.manage')
  createGroup(@Body() dto: CreatePenaltyGroupDto, @CurrentUser() user?: AuthUser) {
    return this.catalogue.createGroup(dto, user?.id ?? null);
  }

  @NotAudited('wired in T28')
  @Patch('penalty-groups/:id')
  @Permission('hr.penalty_catalogue.manage')
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePenaltyGroupDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.catalogue.updateGroup(id, dto, user?.id ?? null);
  }

  @NotAudited('wired in T28')
  @Post('penalty-groups/:groupId/violations')
  @Permission('hr.penalty_catalogue.manage')
  createViolation(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateViolationDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.catalogue.createViolation(groupId, dto, user?.id ?? null);
  }

  @NotAudited('wired in T28')
  @Patch('violations/:id')
  @Permission('hr.penalty_catalogue.manage')
  updateViolation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateViolationDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.catalogue.updateViolation(id, dto, user?.id ?? null);
  }
}
