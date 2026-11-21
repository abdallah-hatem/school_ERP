import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ACCOUNTING_YEAR_RANGE,
  INSURANCE_STATUSES,
  RETURN_REASON_MAX,
  type AccountingPayrollLinesQuery,
  type InsuranceStatus,
  type ReturnPayrollMonthRequest,
} from '@school-erp/shared';
import { PayrollPaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
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

/**
 * `GET /accounting/payroll/:month/lines?page&limit&search&insurance` — a payroll table: `limit` up
 * to 500 (`PayrollPaginationQueryDto`).
 */
export class AccountingPayrollLinesQueryDto extends PayrollPaginationQueryDto implements AccountingPayrollLinesQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsIn(INSURANCE_STATUSES)
  insurance?: InsuranceStatus;
}
