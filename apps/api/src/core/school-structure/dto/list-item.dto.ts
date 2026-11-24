import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PAGINATION,
  type CreateListItemRequest,
  type ListStagesQuery,
  type UpdateListItemRequest,
} from '@school-erp/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Query booleans arrive as text: only "true" / "1" mean yes. */
const queryBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

/**
 * Body of `POST` for any named list (stages; HR's departments and job titles share the shape).
 * Both names are required (§3 lists).
 */
export class CreateListItemDto implements CreateListItemRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAr!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

/** Body of `PATCH /:id`. No delete route: an item in use is hidden with `isActive: false` (§3). */
export class UpdateListItemDto
  extends PartialType(CreateListItemDto)
  implements UpdateListItemRequest
{
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListItemsQueryDto implements ListStagesQuery {
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeHidden?: boolean;

  /** With `page`, `limit` or `search`: one page with `meta` (no defaults, so their absence means the whole list). */
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
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ids?: string[];

  /** Leave these out (a picker hiding what is already chosen); comma-separated, ≤ 50. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  excludeIds?: string[];
}

/** True when the list is asked for a page (the Settings screen) rather than whole (choices). */
export function wantsPage(query: ListItemsQueryDto): boolean {
  return query.page !== undefined || query.limit !== undefined || Boolean(query.search) || query.ids !== undefined || query.excludeIds !== undefined;
}

