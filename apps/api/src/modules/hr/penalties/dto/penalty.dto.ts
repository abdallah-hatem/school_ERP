import {
  PENALTY_STATUSES,
  type CancelPenaltyRequest,
  type CreatePenaltyRequest,
  type ListPenaltiesQuery,
  type PenaltyPreviewQuery,
  type PenaltyStatus,
} from '@school-erp/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
