import { PartialType } from '@nestjs/mapped-types';
import {
  DEGREES,
  Degree,
  EMPLOYEE_STATUSES,
  EmployeeStatus,
  GENDERS,
  Gender,
  INSURANCE_STATUSES,
  InsuranceStatus,
  isValidEgyptianIban,
  isValidGraduationYear,
  isValidInsuranceNumber,
  MAX_MONTHLY_PIASTRES,
  normalizeIban,
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
import { Satisfies } from '../../../../common/validators/satisfies.decorator';
import { todayIsoDate } from '../../../../common/utils/dates.util';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Optional text: trimmed, and an empty string means "not given" (stored as null). */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
/** IBAN as stored: no spaces, upper case; empty means "not given". */
const ibanToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = normalizeIban(value);
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
  @Max(MAX_MONTHLY_PIASTRES)
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

  /**
   * §3 (N0): on or after the hire date (service check, 400 `PROBATION_BEFORE_HIRE`). Left out or
   * null on create → hire date + the default probation length; null on edit → no probation.
   */
  @IsOptional()
  @IsIsoDate()
  probationEnd?: string | null;

  @IsOptional()
  @IsBoolean()
  usesBus?: boolean;

  // ── Social insurance (§3): the three details are required when insured (service check) ──

  /** Defaults to NOT_INSURED, which clears the three details. */
  @IsOptional()
  @IsIn(INSURANCE_STATUSES)
  insuranceStatus?: InsuranceStatus;

  /** Digits only, unique. */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @Satisfies<string>(isValidInsuranceNumber, 'must be digits only (up to 20)')
  insuranceNumber?: string | null;

  /** Not in the future. */
  @IsOptional()
  @IsIsoDate()
  @IsNotFutureDate()
  insuranceRegistrationDate?: string | null;

  /** Monthly, integer piastres, > 0. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MONTHLY_PIASTRES)
  insuredSalary?: number | null;

  // ── Bank account ──

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(100)
  bankName?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(50)
  bankAccountNumber?: string | null;

  /** Egyptian IBAN: `EG` + 27 digits (spaces and case are normalised first). */
  @IsOptional()
  @Transform(ibanToNull)
  @IsString()
  @Satisfies<string>(isValidEgyptianIban, 'must be EG followed by 27 digits')
  iban?: string | null;

  // ── Emergency contact (phone: the same rules as the employee phone) ──

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(200)
  emergencyContactName?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(100)
  emergencyContactRelationship?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(30)
  emergencyContactPhone?: string | null;

  // ── Qualification ──

  @IsOptional()
  @IsIn(DEGREES)
  highestDegree?: Degree | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(200)
  major?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(200)
  university?: string | null;

  /** 1950 … the current year (server clock). */
  @IsOptional()
  @IsInt()
  @Satisfies<number>((y) => isValidGraduationYear(y, todayIsoDate()), 'must be from 1950 to the current year')
  graduationYear?: number | null;
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

  /** `?managesPeople=true` — only employees whose job title manages people (§3 picker). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  managesPeople?: boolean;

  /** Leave this employee out (the one being edited). */
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
