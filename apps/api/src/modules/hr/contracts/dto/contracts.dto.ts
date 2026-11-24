import {
  CONTRACT_DECISION_FILTERS,
  CONTRACT_END_REASONS,
  NON_RENEWAL_BY,
  NonRenewalBy,
  type ContractDecisionFilter,
  type ContractEndRequestReason,
  type DeactivateContractsRequest,
  type EarlyTerminationRequest,
  type EndContractRequest,
  type NewContractRequest,
  type UndoNotRenewRequest,
  type ListContractsQuery,
  type NotRenewContractRequest,
  type PutSchoolCalendarRequest,
  type RejectEarlyTerminationRequest,
  type RenewContractsRequest,
  type WithdrawNoticeRequest,
  type CancelContractRequest,
} from '@school-erp/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { IsIsoDate, IsNotFutureDate } from '../../../../common/validators/iso-date.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/** A contract year, `2026` = 2026/27. */
export const CONTRACT_YEAR_MIN = 2000;
export const CONTRACT_YEAR_MAX = 2100;

/** At most this many contracts in one bulk renewal or deactivation. */
export const CONTRACT_BULK_MAX = 500;

/** `GET /hr/contracts?year&decision&stageId&search&page&limit`. */
export class ListContractsQueryDto extends PaginationQueryDto implements ListContractsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(CONTRACT_YEAR_MIN)
  @Max(CONTRACT_YEAR_MAX)
  year?: number;

  @IsOptional()
  @IsIn(CONTRACT_DECISION_FILTERS)
  decision?: ContractDecisionFilter;

  @IsOptional()
  @IsUUID()
  stageId?: string;
}

/** `GET /hr/employees/:id/contracts?page&limit`. */
export class EmployeeContractsQueryDto extends PaginationQueryDto {}

class ContractIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTRACT_BULK_MAX)
  @IsUUID('all', { each: true })
  contractIds: string[];
}

/** `POST /hr/contracts/renew`. */
export class RenewContractsDto extends ContractIdsDto implements RenewContractsRequest {}

/** `POST /hr/contracts/deactivate`. */
export class DeactivateContractsDto extends ContractIdsDto implements DeactivateContractsRequest {}

/** A document uploaded with `POST /hr/contracts/:id/files`. */
const FILE_URL_MAX = 300;

/** `POST /hr/contracts/:id/not-renewed`. The employee's notice needs the day it was received. */
export class NotRenewContractDto implements NotRenewContractRequest {
  @IsIn(NON_RENEWAL_BY)
  by: NonRenewalBy;

  @ValidateIf((o: NotRenewContractDto) => o.by === NonRenewalBy.EMPLOYEE)
  @IsNotFutureDate()
  receivedOn?: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(FILE_URL_MAX)
  fileUrl?: string | null;
}

/** `POST /hr/contracts/:id/notice/withdraw` — the reason is required. */
export class WithdrawNoticeDto implements WithdrawNoticeRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** `POST /hr/contracts/:id/not-renewed/undo` — the reason is required. */
export class UndoNotRenewDto implements UndoNotRenewRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** `POST /hr/contracts/:id/cancel` — an upcoming contract that isn't a renewal, with a reason. */
export class CancelContractDto implements CancelContractRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** `POST /hr/employees/:id/contracts` — from `startsOn` (default 1 June of the current contract year). */
export class NewContractDto implements NewContractRequest {
  @IsOptional()
  @IsIsoDate()
  startsOn?: string;
}

/** `POST /hr/contracts/:id/early-termination` — the day the request was handed in. */
export class EarlyTerminationDto implements EarlyTerminationRequest {
  @IsNotFutureDate()
  requestedOn: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(FILE_URL_MAX)
  fileUrl?: string | null;
}

/** `POST /hr/contracts/:id/early-termination/reject` — the reason is required. */
export class RejectEarlyTerminationDto implements RejectEarlyTerminationRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** `POST /hr/contracts/:id/end` — a reason, the last day, a note, an optional attachment. */
export class EndContractDto implements EndContractRequest {
  @IsIn(CONTRACT_END_REASONS)
  reason: ContractEndRequestReason;

  @IsIsoDate()
  endsOn: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;

  @IsOptional()
  @IsString()
  @MaxLength(FILE_URL_MAX)
  fileUrl?: string | null;
}

/** `PUT /hr/settings/school-calendar/:year`. Order and range are checked by the service. */
export class PutSchoolCalendarDto implements PutSchoolCalendarRequest {
  @IsIsoDate()
  term1Start: string;

  @IsIsoDate()
  term1End: string;

  @IsIsoDate()
  term2Start: string;

  @IsIsoDate()
  nonRenewalDeadline: string;
}
