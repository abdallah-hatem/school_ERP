import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AccountingPayrollMonth } from '@school-erp/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { Permission } from '../../../../core/permissions';
import { AccountingPayrollMonthParamDto } from '../dto/accounting-payroll.dto';
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

  @Get(':month')
  @Permission('accounting.payroll.view')
  get(@Param() params: AccountingPayrollMonthParamDto): Promise<AccountingPayrollMonth> {
    return this.payroll.getMonth(params.month);
  }
}
