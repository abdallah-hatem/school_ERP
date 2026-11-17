import { PartialType } from '@nestjs/mapped-types';
import type { CreateListItemRequest, UpdateListItemRequest } from '@school-erp/shared';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

/** `?includeHidden=true` also returns hidden items (for the Settings screen). */
export class ListItemsQueryDto {
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
}
