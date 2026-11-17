import { PartialType } from '@nestjs/mapped-types';
import {
  EMPLOYEE_STATUSES,
  EmployeeStatus,
  GENDERS,
  Gender,
  WORK_SYSTEMS,
  WorkSystem,
} from '@school-erp/shared';
import type { CreateEmployeeRequest, ListEmployeesQuery } from '@school-erp/shared';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { IsIsoDate, IsNotFutureDate } from '../../../../common/validators/iso-date.validator';

/** Postgres `integer` upper bound — salaries above it can't be stored. */
const MAX_PIASTRES = 2_147_483_647;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Optional text: trimmed, and an empty string means "not given" (stored as null). */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/** `POST /hr/employees` — every §3 field except `code` and `status`. */
export class CreateEmployeeDto implements CreateEmployeeRequest {
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

  /** Optional; if given, 14 digits and unique (§3 GUESS). */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @Matches(/^\d{14}$/, { message: 'nationalId must be exactly 14 digits' })
  nationalId?: string | null;

  @IsIn(GENDERS)
  gender: Gender;

  @IsIsoDate()
  dateOfBirth: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  /** Required; not in the future (§3). */
  @IsIsoDate()
  @IsNotFutureDate()
  hireDate: string;

  @IsUUID()
  stageId: string;

  @IsUUID()
  departmentId: string;

  @IsUUID()
  jobTitleId: string;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(50)
  grade?: string | null;

  @IsIn(WORK_SYSTEMS)
  workSystem: WorkSystem;

  /** Monthly, integer piastres, > 0. */
  @IsInt()
  @Min(1)
  @Max(MAX_PIASTRES)
  basicSalary: number;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(50)
  fingerprintId?: string | null;

  @IsOptional()
  @IsIsoDate()
  contractStart?: string;

  @IsOptional()
  @IsIsoDate()
  contractEnd?: string;

  @IsOptional()
  @IsBoolean()
  usesBus?: boolean;
}

/** `PATCH /hr/employees/:id` — any subset. Required fields can't be cleared (service check). */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

/** `GET /hr/employees` filters on top of `?page&limit&search`. */
export class ListEmployeesQueryDto extends PaginationQueryDto implements ListEmployeesQuery {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: EmployeeStatus;

  @IsOptional()
  @IsIn(WORK_SYSTEMS)
  workSystem?: WorkSystem;
}
