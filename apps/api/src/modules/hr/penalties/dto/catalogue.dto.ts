import {
  PENALTY_ACTIONS,
  type CreatePenaltyGroupRequest,
  type CreateViolationRequest,
  type PenaltyAction,
  type PenaltyCatalogueQuery,
  type UpdatePenaltyGroupRequest,
  type UpdateViolationRequest,
  type ViolationLevelInput,
} from '@school-erp/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../../../../common/validators/is-optional-not-null.decorator';
import { IsValidDays } from '../../../../common/validators/is-valid-days.decorator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Optional text: trimmed, and an empty string means "none" (stored as null). */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/**
 * One catalogue level. Shape only — the cross-level rules (1–5 entries numbered 1..n, days fit
 * the action) are checked by the shared `violationLevelsProblem` (400 `INVALID_LEVELS`).
 */
export class ViolationLevelDto implements ViolationLevelInput {
  @IsInt()
  @Min(1)
  level: number;

  @IsIn(PENALTY_ACTIONS)
  action: PenaltyAction;

  /** Quarter steps 0–30 (§7); `null` / missing = no days. */
  @IsOptional()
  @IsValidDays()
  days?: number | null;
}

/** `POST /hr/penalty-groups/:groupId/violations`. */
export class CreateViolationDto implements CreateViolationRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  nameEn: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  nameAr: string;

  /** Free text for the reviewer, e.g. "doubles on repeat" (stored, never applied — §4 GUESS). */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  /** §4: at most one pending/approved penalty per employee per date. Default true. */
  @IsOptionalNotNull()
  @IsBoolean()
  oncePerDay?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ViolationLevelDto)
  levels: ViolationLevelDto[];
}

/** `PATCH /hr/violations/:id`. Names and levels can't be cleared; `isActive: false` retires it. */
export class UpdateViolationDto implements UpdateViolationRequest {
  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  nameEn?: string;

  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  nameAr?: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  /** §4: turning it on or off never changes penalties already recorded. */
  @IsOptionalNotNull()
  @IsBoolean()
  oncePerDay?: boolean;

  @IsOptionalNotNull()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ViolationLevelDto)
  levels?: ViolationLevelDto[];
}

/** `POST /hr/penalty-groups`. */
export class CreatePenaltyGroupDto implements CreatePenaltyGroupRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameEn: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameAr: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * `PATCH /hr/penalty-groups/:id`. No DELETE: `isActive: false` retires a group. Written out rather
 * than `PartialType` so an explicit `null` name is a 400 instead of slipping past `@IsOptional`.
 */
export class UpdatePenaltyGroupDto implements UpdatePenaltyGroupRequest {
  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameEn?: string;

  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameAr?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * `GET /hr/penalty-groups?search` — searched here, never in the browser (owner, 2026-11-21): a group
 * whose name matches keeps every violation; otherwise only its matching violations; a group with
 * none is left out. Either language, case, marks and Arabic letter variants ignored.
 */
export class PenaltyCatalogueQueryDto implements PenaltyCatalogueQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
