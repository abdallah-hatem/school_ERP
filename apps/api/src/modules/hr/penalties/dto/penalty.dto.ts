import {
  PENALTY_ACTIONS,
  PENALTY_STATUS_FILTERS,
  type ApprovePenaltyRequest,
  type CancelPenaltyRequest,
  type CreatePenaltyRequest,
  type ListPenaltiesQuery,
  type PenaltyAction,
  type PenaltyPreviewQuery,
  type PenaltyRecountAcknowledgement,
  type PenaltyStatusFilter,
  type RejectPenaltyRequest,
  type ReviewPenaltyRequest,
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

  /** The stage where it happened (owner 2026-11-21) — required when the employee has several. */
  @IsOptional()
  @IsUUID()
  stageId?: string;
}

/** `POST /hr/penalties` — a new record, PENDING_REVIEW or straight to WAITING_HR (§4). */
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

  /** How many recounted penalties in stages the approver doesn't see they confirmed (L1). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  acknowledgedRecountElsewhere?: number;

  /** Optional note with the HR approval. */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

/** `POST /hr/penalties/:id/review/approve` — the stage head approves, with an optional note. */
export class ReviewPenaltyDto implements ReviewPenaltyRequest {
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

/**
 * `POST /hr/penalties/:id/review/reject` and `POST /hr/penalties/:id/reject` — a reason is
 * required: not blank once trimmed, at most 1,000 characters, any script (owner 2026-11-21).
 */
export class RejectPenaltyDto implements RejectPenaltyRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** `POST /hr/penalties/:id/cancel` — the reason is required (§4). */
export class CancelPenaltyDto implements CancelPenaltyRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** `GET /hr/penalties?page&limit&search&employeeId&month&status&stageId`. */
export class ListPenaltiesQueryDto extends PaginationQueryDto implements ListPenaltiesQuery {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsMonth()
  month?: string;

  /** One status, or `OPEN`: waiting at either step. */
  @IsOptional()
  @IsIn(PENALTY_STATUS_FILTERS)
  status?: PenaltyStatusFilter;

  /** The stage where the violation happened. */
  @IsOptional()
  @IsUUID()
  stageId?: string;
}
