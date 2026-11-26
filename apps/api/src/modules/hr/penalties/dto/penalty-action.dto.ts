import {
  PAGINATION,
  PENALTY_EFFECTS,
  PENALTY_SALARY_BASES,
  type CreatePenaltyActionRequest,
  type ListPenaltyActionsQuery,
  type PenaltyEffect,
  type PenaltySalaryBase,
  type UpdatePenaltyActionRequest,
} from '@school-erp/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsOptionalNotNull } from '../../../../common/validators/is-optional-not-null.decorator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Names up to 100 (spec 2026-11-25), like the other managed lists. */
export const PENALTY_ACTION_NAME_MAX = 100;

/**
 * `POST /hr/penalty-actions`. Shape only — the effect ↔ base rule (a base for DEDUCT_PERCENT and
 * only for it) is the service's, so it answers with the spec's 400.
 */
export class CreatePenaltyActionDto implements CreatePenaltyActionRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PENALTY_ACTION_NAME_MAX)
  nameEn: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PENALTY_ACTION_NAME_MAX)
  nameAr: string;

  @IsIn(PENALTY_EFFECTS)
  effect: PenaltyEffect;

  @IsOptional()
  @IsIn(PENALTY_SALARY_BASES)
  percentBase?: PenaltySalaryBase | null;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

/**
 * `PATCH /hr/penalty-actions/:id` — rename, reorder, hide, show. `effect` and `percentBase` are
 * accepted here only so the service can refuse them with `PENALTY_ACTION_EFFECT_LOCKED` (a plain
 * whitelist 400 would not say why).
 */
export class UpdatePenaltyActionDto implements UpdatePenaltyActionRequest {
  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PENALTY_ACTION_NAME_MAX)
  nameEn?: string;

  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PENALTY_ACTION_NAME_MAX)
  nameAr?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  /** Refused (fixed once added). */
  @IsOptional()
  effect?: unknown;

  /** Refused (fixed once added). */
  @IsOptional()
  percentBase?: unknown;
}

/** `GET /hr/penalty-actions?includeHidden&search&page&limit` — no `page`/`limit`/`search`: the whole list. */
export class ListPenaltyActionsQueryDto implements ListPenaltyActionsQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true ? true : value === 'false' || value === false ? false : value,
  )
  @IsBoolean()
  includeHidden?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.maxLimit)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  search?: string;
}

/** True when a page is asked for (Settings) rather than the whole list (the level editor's picker). */
export function wantsActionsPage(query: ListPenaltyActionsQueryDto): boolean {
  return query.page !== undefined || query.limit !== undefined || Boolean(query.search);
}
