import { SETTING_LIMITS, type Month, type PutLatenessRequest } from '@school-erp/shared';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDefined,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsMonth } from '../../../../common/validators/month.validator';

/** `GET /hr/lateness?month=YYYY-MM`. */
export class LatenessMonthQueryDto {
  @IsDefined()
  @IsMonth()
  month: Month;
}

/** `PUT /hr/lateness/:month`. */
export class LatenessMonthParamDto {
  @IsMonth()
  month: Month;
}

export class LatenessEntryDto {
  @IsUUID()
  employeeId: string;

  /** The month's accumulated late + early-leave minutes: a whole number, 0–6,000 (§5). */
  @IsInt()
  @Min(0)
  @Max(SETTING_LIMITS.latenessMinutesMax)
  minutes: number;
}

/** Only the given employees are written; everyone else keeps their stored value (or 0). */
export class PutLatenessDto implements PutLatenessRequest {
  @IsArray()
  @ArrayUnique((entry: LatenessEntryDto) => entry?.employeeId, {
    message: 'entries must not repeat an employeeId',
  })
  @ValidateNested({ each: true })
  @Type(() => LatenessEntryDto)
  entries: LatenessEntryDto[];
}
