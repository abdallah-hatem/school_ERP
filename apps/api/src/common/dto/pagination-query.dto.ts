import { PAGINATION, PAYROLL_PAGINATION } from '@school-erp/shared';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** `?page&limit&search` (contract). `limit` above the contract max is a 400, not a silent cap. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = PAGINATION.defaultPage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.maxLimit)
  limit?: number = PAGINATION.defaultLimit;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}

/**
 * `?page&limit` of a payroll table: the reader picks the page size, up to 500 (owner, 2026-11-19).
 * Its own class, not a subclass: class-validator keeps a parent's `@Max(100)` on an override.
 */
export class PayrollPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = PAGINATION.defaultPage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAYROLL_PAGINATION.maxLimit)
  limit?: number = PAGINATION.defaultLimit;
}
