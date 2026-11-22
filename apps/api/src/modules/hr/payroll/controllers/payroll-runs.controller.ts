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
} from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { PayrollPaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { resolveLanguage } from '../../../../common/i18n/i18n';
import { RateLimit } from '../../../../common/rate-limit';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { xlsxFile } from '../../../../common/utils/xlsx-file.util';
import { CreateAdjustmentDto, CreatePayrollRunDto, PayrollRunQueryDto } from '../dto/payroll.dto';
import { PayrollService } from '../services/payroll.service';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/**
 * Payroll runs (contract: "Payroll — hr"). No DELETE route for runs: an approved run is never
 * edited or deleted (§6); only a draft's adjustments can be removed.
 */
@Controller('hr/payroll-runs')
export class PayrollRunsController {
  constructor(private readonly payroll: PayrollService) {}

  @Get()
  @Permission('hr.payroll.view')
  async list(@Query() query: PayrollPaginationQueryDto) {
    return ResponseUtil.paginated(await this.payroll.list(query));
  }

  @Audited('hr.payroll.create')
  @Post()
  @Permission('hr.payroll.create')
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user?: AuthUser) {
    return this.payroll.create(dto.month, user?.id ?? null);
  }

  @Get(':id')
  @Permission('hr.payroll.view')
  get(@Param('id', ParseUUIDPipe) id: string, @Query() query: PayrollRunQueryDto) {
    return this.payroll.get(id, query);
  }

  @Audited('hr.payroll.recalculate')
  @Post(':id/recalculate')
  @Permission('hr.payroll.recalculate')
  @HttpCode(HttpStatus.OK)
  recalculate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.payroll.recalculate(id, user?.id ?? null);
  }

  @Audited('hr.payroll.approve')
  @Post(':id/approve')
  @Permission('hr.payroll.approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.payroll.approve(id, user?.id ?? null);
  }

  @Get(':id/bank-sheet')
  @RateLimit('heavy')
  @Permission('hr.payroll.export_bank_sheet')
  async bankSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return xlsxFile(await this.payroll.bankSheet(id, resolveLanguage(acceptLanguage)));
  }

  @Get(':id/lines/:lineId')
  @Permission('hr.payroll.view')
  payslip(@Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string) {
    return this.payroll.payslip(id, lineId);
  }

  @Audited('hr.payroll.adjustment_add')
  @Post(':id/adjustments')
  @Permission('hr.payroll.adjust')
  addAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.payroll.addAdjustment(id, dto, user?.id ?? null);
  }

  @Audited('hr.payroll.adjustment_remove')
  @Delete(':id/adjustments/:adjustmentId')
  @Permission('hr.payroll.adjust')
  removeAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adjustmentId', ParseUUIDPipe) adjustmentId: string,
  ) {
    return this.payroll.removeAdjustment(id, adjustmentId);
  }
}
