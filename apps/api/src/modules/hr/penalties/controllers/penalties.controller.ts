import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ResponseUtil } from '../../../../common/utils/response.util';
import {
  CancelPenaltyDto,
  CreatePenaltyDto,
  ListPenaltiesQueryDto,
  PenaltyPreviewQueryDto,
} from '../dto/penalty.dto';
import { PenaltyRecordsService } from '../services/penalty-records.service';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/**
 * Penalty records (contract: "Penalty records — hr"). No DELETE route: a penalty is cancelled with
 * a reason, never deleted (§4). Each write is one audit entry on the penalty (§9).
 */
@Controller('hr/penalties')
export class PenaltiesController {
  constructor(private readonly penalties: PenaltyRecordsService) {}

  @Get()
  @Permission('hr.penalties.view')
  async list(@Query() query: ListPenaltiesQueryDto) {
    return ResponseUtil.paginated(await this.penalties.list(query));
  }

  // Declared before `:id` so "preview" is never parsed as an id.
  @Get('preview')
  @Permission('hr.penalties.record')
  preview(@Query() query: PenaltyPreviewQueryDto) {
    return this.penalties.preview(query);
  }

  @Get(':id')
  @Permission('hr.penalties.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.penalties.get(id);
  }

  @Audited('hr.penalty.record')
  @Post()
  @Permission('hr.penalties.record')
  create(@Body() dto: CreatePenaltyDto, @CurrentUser() user?: AuthUser) {
    return this.penalties.create(dto, user?.id ?? null);
  }

  @Audited('hr.penalty.approve')
  @Post(':id/approve')
  @Permission('hr.penalties.approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.penalties.approve(id, user?.id ?? null);
  }

  @Audited('hr.penalty.cancel')
  @Post(':id/cancel')
  @Permission('hr.penalties.cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPenaltyDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.penalties.cancel(id, dto, user?.id ?? null);
  }
}
