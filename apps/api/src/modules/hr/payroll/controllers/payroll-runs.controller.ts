import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { resolveLanguage } from '../../../../common/i18n/i18n';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { CreateAdjustmentDto, CreatePayrollRunDto, PayrollRunQueryDto } from '../dto/payroll.dto';
import { PayrollService } from '../services/payroll.service';
import { NotAudited } from '../../../../core/audit';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Payroll runs (contract: "Payroll — hr"). No DELETE route for runs: an approved run is never
 * edited or deleted (§6); only a draft's adjustments can be removed.
 */
@Controller('hr/payroll-runs')
export class PayrollRunsController {
  constructor(private readonly payroll: PayrollService) {}

  @Get()
  async list(@Query() query: PaginationQueryDto) {
    return ResponseUtil.paginated(await this.payroll.list(query));
  }

  @NotAudited('wired in T29')
  @Post()
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user?: AuthUser) {
    return this.payroll.create(dto.month, user?.id ?? null);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Query() query: PayrollRunQueryDto) {
    return this.payroll.get(id, query);
  }

  @NotAudited('wired in T29')
  @Post(':id/recalculate')
  @HttpCode(HttpStatus.OK)
  recalculate(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.recalculate(id);
  }

  @NotAudited('wired in T29')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.payroll.approve(id, user?.id ?? null);
  }

  @Get(':id/bank-sheet')
  async bankSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const { fileName, content } = await this.payroll.bankSheet(id, resolveLanguage(acceptLanguage));
    return new StreamableFile(content, {
      type: XLSX,
      disposition: `attachment; filename="${fileName}"`,
      length: content.length,
    });
  }

  @Get(':id/lines/:lineId')
  payslip(@Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string) {
    return this.payroll.payslip(id, lineId);
  }

  @NotAudited('wired in T29')
  @Post(':id/adjustments')
  addAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.payroll.addAdjustment(id, dto, user?.id ?? null);
  }

  @NotAudited('wired in T29')
  @Delete(':id/adjustments/:adjustmentId')
  removeAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adjustmentId', ParseUUIDPipe) adjustmentId: string,
  ) {
    return this.payroll.removeAdjustment(id, adjustmentId);
  }
}
