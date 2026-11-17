import {
  ADJUSTMENT_TYPES,
  type AdjustmentType,
  type CreateAdjustmentRequest,
  type CreatePayrollRunRequest,
  type PayrollRunQuery,
} from '@school-erp/shared';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsMonth } from '../../../../common/validators/month.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Largest single adjustment: EGP 10,000,000.00 (keeps every line inside a 32-bit column). */
export const MAX_ADJUSTMENT_PIASTRES = 1_000_000_000;

/** `POST /hr/payroll-runs` — one run per month (§6). */
export class CreatePayrollRunDto implements CreatePayrollRunRequest {
  @IsMonth()
  month: string;
}

/** `GET /hr/payroll-runs/:id?search&departmentId&flagged` — filters the lines, not the totals. */
export class PayrollRunQueryDto implements PayrollRunQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  /** The department snapshot on the line (where the employee was at calculation). */
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  flagged?: boolean;
}

/** `POST /hr/payroll-runs/:id/adjustments` — a one-off addition or deduction (§6). */
export class CreateAdjustmentDto implements CreateAdjustmentRequest {
  @IsUUID()
  employeeId: string;

  @IsIn(ADJUSTMENT_TYPES)
  type: AdjustmentType;

  /** Whole piastres, > 0. */
  @IsInt()
  @Min(1)
  @Max(MAX_ADJUSTMENT_PIASTRES)
  amount: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
