import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { ACCOUNTING_YEAR_RANGE, RETURN_REASON_MAX, type ReturnPayrollMonthRequest } from '@school-erp/shared';
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

/** `POST /accounting/payroll/:month/return` — why the month goes back to HR (required). */
export class ReturnPayrollMonthDto implements ReturnPayrollMonthRequest {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(RETURN_REASON_MAX)
  reason: string;
}
