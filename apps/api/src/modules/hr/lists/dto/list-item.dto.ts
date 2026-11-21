import { PartialType } from '@nestjs/mapped-types';
import {
  PAGINATION,
  type CreateJobTitleRequest,
  type CreateListItemRequest,
  type ListStagesQuery,
  type UpdateJobTitleRequest,
  type UpdateListItemRequest,
} from '@school-erp/shared';
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

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Departments and job titles (same shape as stages): both names required (§3). */
export class CreateListItemDto implements CreateListItemRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAr: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

/** Any subset of the names / order, plus `isActive` (hide instead of delete, §3). */
export class UpdateListItemDto
  extends PartialType(CreateListItemDto)
  implements UpdateListItemRequest
{
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** A job title: the list fields plus `managesPeople` (§3 direct managers; defaults to false). */
export class CreateJobTitleDto extends CreateListItemDto implements CreateJobTitleRequest {
  @IsOptional()
  @IsBoolean()
  managesPeople?: boolean;
}

export class UpdateJobTitleDto extends UpdateListItemDto implements UpdateJobTitleRequest {
  @IsOptional()
  @IsBoolean()
  managesPeople?: boolean;
}

/** `?includeHidden=true` also returns hidden items (for the Settings screen). */
export class ListItemsQueryDto implements ListStagesQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
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
}

/** True when the list is asked for a page (the Settings screen) rather than whole (choices). */
export function wantsPage(query: ListItemsQueryDto): boolean {
  return query.page !== undefined || query.limit !== undefined || Boolean(query.search) || query.ids !== undefined;
}

