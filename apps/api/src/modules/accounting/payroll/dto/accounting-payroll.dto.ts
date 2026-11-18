import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ACCOUNTING_YEAR_RANGE } from '@school-erp/shared';
import { IsMonth } from '../../../../common/validators/month.validator';

/** `/accounting/payroll/:month` — `YYYY-MM`. */
export class AccountingPayrollMonthParamDto {
  @IsMonth()
  month: string;
}

/** `/accounting/payroll/year/:year` — a calendar year. */
export class AccountingPayrollYearParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(ACCOUNTING_YEAR_RANGE.min)
  @Max(ACCOUNTING_YEAR_RANGE.max)
  year: number;
}
