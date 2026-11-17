import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type ListUsersQuery,
  type SetTemporaryPasswordRequest,
  type UpdateUserRequest,
} from '@school-erp/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** A password an admin or a user sets (R9). Never trimmed: spaces are part of it. */
function Password(): PropertyDecorator {
  return (target, key) => {
    IsString()(target, key);
    MinLength(PASSWORD_MIN_LENGTH)(target, key);
    MaxLength(200)(target, key);
  };
}

/** `POST /users` — the password is temporary: the user is asked to change it (R9). */
export class CreateUserDto implements CreateUserRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(lower)
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Password()
  password!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  roleIds!: string[];

  /** null or absent: not linked to an employee. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  employeeId?: string | null;
}

/** `PATCH /users/:id` — `roleIds`, when sent, replaces the user's roles; `employeeId: null` unlinks. */
export class UpdateUserDto
  extends PartialType(OmitType(CreateUserDto, ['password'] as const))
  implements UpdateUserRequest {}

export class SetTemporaryPasswordDto implements SetTemporaryPasswordRequest {
  @Password()
  password!: string;
}

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword!: string;

  @Password()
  newPassword!: string;
}

export class ListUsersQueryDto extends PaginationQueryDto implements ListUsersQuery {
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
