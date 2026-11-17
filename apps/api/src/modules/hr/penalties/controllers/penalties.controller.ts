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
import { NotAudited } from '../../../../core/audit';

/**
 * Penalty records (contract: "Penalty records — hr"). No DELETE route: a penalty is cancelled with
 * a reason, never deleted (§4).
 */
@Controller('hr/penalties')
export class PenaltiesController {
  constructor(private readonly penalties: PenaltyRecordsService) {}

  @Get()
  async list(@Query() query: ListPenaltiesQueryDto) {
    return ResponseUtil.paginated(await this.penalties.list(query));
  }

  // Declared before `:id` so "preview" is never parsed as an id.
  @Get('preview')
  preview(@Query() query: PenaltyPreviewQueryDto) {
    return this.penalties.preview(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.penalties.get(id);
  }

  @NotAudited('wired in T29')
  @Post()
  create(@Body() dto: CreatePenaltyDto, @CurrentUser() user?: AuthUser) {
    return this.penalties.create(dto, user?.id ?? null);
  }

  @NotAudited('wired in T29')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.penalties.approve(id, user?.id ?? null);
  }

  @NotAudited('wired in T29')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPenaltyDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.penalties.cancel(id, dto, user?.id ?? null);
  }
}
