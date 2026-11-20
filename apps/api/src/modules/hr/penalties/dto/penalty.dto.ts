import {
  PENALTY_ACTIONS,
  PENALTY_STATUSES,
  type ApprovePenaltyRequest,
  type CancelPenaltyRequest,
  type CreatePenaltyRequest,
  type ListPenaltiesQuery,
  type PenaltyAction,
  type PenaltyPreviewQuery,
  type PenaltyRecountAcknowledgement,
  type PenaltyStatus,
} from '@school-erp/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { IsNotFutureDate } from '../../../../common/validators/iso-date.validator';
import { IsMonth } from '../../../../common/validators/month.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/** `GET /hr/penalties/preview?employeeId&violationId&date` — nothing is saved. */
export class PenaltyPreviewQueryDto implements PenaltyPreviewQuery {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  violationId: string;

  /** The day the violation happened: a real date, not in the future (§4). */
  @IsNotFutureDate()
  date: string;
}

/** `POST /hr/penalties` — a new PENDING record. */
export class CreatePenaltyDto extends PenaltyPreviewQueryDto implements CreatePenaltyRequest {
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

/** One recounted penalty as the approver's screen showed it (§4 backdated penalty). */
export class PenaltyRecountAcknowledgementDto implements PenaltyRecountAcknowledgement {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(1)
  @Max(5)
  level: number;

  @IsIn(PENALTY_ACTIONS)
  action: PenaltyAction;

  @IsOptional()
  @IsNumber()
  days: number | null;
}

/**
 * `POST /hr/penalties/:id/approve` — an empty body is fine; `acknowledgedRecount` confirms the
 * approved penalties a backdated approval moves up (§4, owner 2026-11-20).
 */
export class ApprovePenaltyDto implements ApprovePenaltyRequest {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PenaltyRecountAcknowledgementDto)
  acknowledgedRecount?: PenaltyRecountAcknowledgementDto[];
}

/** `POST /hr/penalties/:id/cancel` — the reason is required (§4). */
export class CancelPenaltyDto implements CancelPenaltyRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** `GET /hr/penalties?page&limit&search&employeeId&month&status`. */
export class ListPenaltiesQueryDto extends PaginationQueryDto implements ListPenaltiesQuery {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsMonth()
  month?: string;

  @IsOptional()
  @IsIn(PENALTY_STATUSES)
  status?: PenaltyStatus;
}
