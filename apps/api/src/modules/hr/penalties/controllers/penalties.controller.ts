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
  ApprovePenaltyDto,
  CancelPenaltyDto,
  CreatePenaltyDto,
  ListPenaltiesQueryDto,
  PenaltyPreviewQueryDto,
  RejectPenaltyDto,
  ReviewPenaltyDto,
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

  /** The stages a penalty for this employee can be recorded in (owner 2026-11-21). */
  @Get('employee-stages/:employeeId')
  @Permission('hr.penalties.record')
  employeeStages(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.penalties.employeeStages(employeeId);
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

  /** The stage review: PENDING_REVIEW → WAITING_HR (§4 two steps). */
  @Audited('hr.penalty.review')
  @Post(':id/review/approve')
  @Permission('hr.penalties.review')
  @HttpCode(HttpStatus.OK)
  reviewApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPenaltyDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.penalties.reviewApprove(id, user?.id ?? null, dto?.note ?? null);
  }

  /** The stage review rejects, with a reason: PENDING_REVIEW → REJECTED. */
  @Audited('hr.penalty.reject')
  @Post(':id/review/reject')
  @Permission('hr.penalties.review')
  @HttpCode(HttpStatus.OK)
  reviewReject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPenaltyDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.penalties.reject(id, 'REVIEW_REJECT', dto.reason, user?.id ?? null);
  }

  /** The HR step: WAITING_HR → APPROVED, fixing the level and the deduction. */
  @Audited('hr.penalty.approve')
  @Post(':id/approve')
  @Permission('hr.penalties.approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovePenaltyDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.penalties.approve(
      id,
      user?.id ?? null,
      dto?.acknowledgedRecount,
      dto?.note ?? null,
      dto?.acknowledgedRecountElsewhere,
    );
  }

  /** The HR step rejects, with a reason: WAITING_HR → REJECTED. */
  @Audited('hr.penalty.reject')
  @Post(':id/reject')
  @Permission('hr.penalties.approve')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPenaltyDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.penalties.reject(id, 'HR_REJECT', dto.reason, user?.id ?? null);
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
