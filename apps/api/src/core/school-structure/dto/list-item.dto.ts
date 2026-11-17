import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
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
import type {
  CreateListItemRequest,
  ListStagesQuery,
  UpdateListItemRequest,
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
}
