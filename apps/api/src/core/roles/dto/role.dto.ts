import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PERMISSION_KEYS,
  PERMISSION_SCOPES,
  type CreateRoleRequest,
  type PermissionKey,
  type PermissionScope,
  type RoleGrant,
  type UpdateRoleRequest,
} from '@school-erp/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RoleGrantDto implements RoleGrant {
  @IsString()
  @IsIn(PERMISSION_KEYS)
  key!: PermissionKey;

  @IsString()
  @IsIn(PERMISSION_SCOPES)
  scope!: PermissionScope;
}

/** `POST /roles` — a custom role (its key is generated). */
export class CreateRoleDto implements CreateRoleRequest {
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

  @IsArray()
  @ArrayMaxSize(PERMISSION_KEYS.length)
  @ValidateNested({ each: true })
  @Type(() => RoleGrantDto)
  permissions!: RoleGrantDto[];
}

/** `PATCH /roles/:id` — `permissions`, when sent, replaces the whole set. */
export class UpdateRoleDto extends PartialType(CreateRoleDto) implements UpdateRoleRequest {}
