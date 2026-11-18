import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreatePenaltyGroupDto,
  CreateViolationDto,
  UpdatePenaltyGroupDto,
  UpdateViolationDto,
} from '../dto/catalogue.dto';
import { PenaltyCatalogueService } from '../services/penalty-catalogue.service';
import { Audited } from '../../../../core/audit';
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

  @Audited('hr.penalty_group.create')
  @Post('penalty-groups')
  @Permission('hr.penalty_catalogue.manage')
  createGroup(@Body() dto: CreatePenaltyGroupDto) {
    return this.catalogue.createGroup(dto);
  }

  @Audited('hr.penalty_group.update')
  @Patch('penalty-groups/:id')
  @Permission('hr.penalty_catalogue.manage')
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePenaltyGroupDto,
  ) {
    return this.catalogue.updateGroup(id, dto);
  }

  @Audited('hr.violation.create')
  @Post('penalty-groups/:groupId/violations')
  @Permission('hr.penalty_catalogue.manage')
  createViolation(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateViolationDto,
  ) {
    return this.catalogue.createViolation(groupId, dto);
  }

  @Audited('hr.violation.update')
  @Patch('violations/:id')
  @Permission('hr.penalty_catalogue.manage')
  updateViolation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateViolationDto,
  ) {
    return this.catalogue.updateViolation(id, dto);
  }
}
