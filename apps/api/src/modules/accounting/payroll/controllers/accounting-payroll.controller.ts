import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import type { AccountingPayrollMonth, AccountingPayrollYear } from '@school-erp/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { resolveLanguage } from '../../../../common/i18n/i18n';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { xlsxFile } from '../../../../common/utils/xlsx-file.util';
import { Permission } from '../../../../core/permissions';
import { AccountingPayrollMonthParamDto, AccountingPayrollYearParamDto } from '../dto/accounting-payroll.dto';
import { AccountingPayrollService } from '../services/accounting-payroll.service';

/**
 * `/accounting/payroll` (§10) — each approved month's payroll taxes: per employee the net HR paid,
 * the insurance share, income tax, martyrs' fund and gross, frozen at approval. Read only.
 */
@Controller('accounting/payroll')
export class AccountingPayrollController {
  constructor(private readonly payroll: AccountingPayrollService) {}

  @Get()
  @Permission('accounting.payroll.view')
  async list(@Query() query: PaginationQueryDto) {
    return ResponseUtil.paginated(await this.payroll.list(query));
  }

  /** The year board: twelve months, each approved (with totals), a draft in HR, or nothing yet. */
  @Get('year/:year')
  @Permission('accounting.payroll.view')
  year(@Param() params: AccountingPayrollYearParamDto): Promise<AccountingPayrollYear> {
    return this.payroll.year(params.year);
  }

  /** The month's lines as the viewer sees them, plus the tax rule used, as `.xlsx`. */
  @Get(':month/export')
  @Permission('accounting.payroll.view')
  async export(
    @Param() params: AccountingPayrollMonthParamDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return xlsxFile(await this.payroll.exportMonth(params.month, resolveLanguage(acceptLanguage)));
  }

  @Get(':month')
  @Permission('accounting.payroll.view')
  get(@Param() params: AccountingPayrollMonthParamDto): Promise<AccountingPayrollMonth> {
    return this.payroll.getMonth(params.month);
  }
}
