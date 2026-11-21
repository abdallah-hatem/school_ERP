import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type { AccountingPayrollLinesPage, AccountingPayrollMonth, AccountingPayrollYear, AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Audited } from '../../../../core/audit';
import { PayrollPaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { resolveLanguage } from '../../../../common/i18n/i18n';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { xlsxFile } from '../../../../common/utils/xlsx-file.util';
import { Permission } from '../../../../core/permissions';
import {
  AccountingPayrollLinesQueryDto,
  AccountingPayrollMonthParamDto,
  AccountingPayrollYearParamDto,
  ReturnPayrollMonthDto,
} from '../dto/accounting-payroll.dto';
import { AccountingPayrollService } from '../services/accounting-payroll.service';

/**
 * `/accounting/payroll` (§10) — each approved month's payroll taxes: per employee the net HR paid,
 * the insurance share, income tax, martyrs' fund and gross, frozen at approval. Read, plus two
 * writes: send a month back to HR, or finalize it (the salaries transferred).
 */
@Controller('accounting/payroll')
export class AccountingPayrollController {
  constructor(private readonly payroll: AccountingPayrollService) {}

  @Get()
  @Permission('accounting.payroll.view')
  async list(@Query() query: PayrollPaginationQueryDto) {
    return ResponseUtil.paginated(await this.payroll.list(query));
  }

  /** The year board: twelve months, each approved (with totals), a draft in HR, or nothing yet. */
  @Get('year/:year')
  @Permission('accounting.payroll.view')
  year(@Param() params: AccountingPayrollYearParamDto): Promise<AccountingPayrollYear> {
    return this.payroll.year(params.year);
  }

  /** Every line of the month as the viewer sees it (not a page), plus the tax rule used, as `.xlsx`. */
  @Get(':month/export')
  @Permission('accounting.payroll.view')
  async export(
    @Param() params: AccountingPayrollMonthParamDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return xlsxFile(await this.payroll.exportMonth(params.month, resolveLanguage(acceptLanguage)));
  }

  /**
   * A page of the month's lines (by code; `limit` ≤ 500), searched by code or either name, one
   * insurance group with `insurance`, and `totals` over every matching line (money only with every
   * salary).
   */
  @Get(':month/lines')
  @Permission('accounting.payroll.view')
  lines(
    @Param() params: AccountingPayrollMonthParamDto,
    @Query() query: AccountingPayrollLinesQueryDto,
  ): Promise<AccountingPayrollLinesPage> {
    return this.payroll.lines(params.month, query);
  }

  /** Sends the approved month back to HR with a reason; refused once finalized. */
  @Post(':month/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited('accounting.payroll.return')
  @Permission('accounting.payroll.return')
  async returnToHr(
    @Param() params: AccountingPayrollMonthParamDto,
    @Body() dto: ReturnPayrollMonthDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<void> {
    await this.payroll.returnToHr(params.month, dto.reason, user?.id ?? null);
  }

  /** Marks the month's salaries transferred: final, never returned to HR. */
  @Post(':month/finalize')
  @HttpCode(HttpStatus.OK)
  @Audited('accounting.payroll.finalize')
  @Permission('accounting.payroll.finalize')
  finalize(
    @Param() params: AccountingPayrollMonthParamDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<AccountingPayrollMonth> {
    return this.payroll.finalize(params.month, user?.id ?? null);
  }

  @Get(':month')
  @Permission('accounting.payroll.view')
  get(@Param() params: AccountingPayrollMonthParamDto): Promise<AccountingPayrollMonth> {
    return this.payroll.getMonth(params.month);
  }
}
