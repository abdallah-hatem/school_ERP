import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  LANGUAGES,
  WEEKDAYS,
  type Language,
  type UpdateSchoolSettingsRequest,
  type Weekday,
} from '@school-erp/shared';

/** `HH:mm`, 24-hour, zero-padded (so two times compare as text). */
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** `PATCH /settings/school` — any subset; `logoUrl` is set only by the upload route. */
export class UpdateSchoolSettingsDto implements UpdateSchoolSettingsRequest {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsIn(LANGUAGES)
  defaultLanguage?: Language;

  @IsOptional()
  @IsString()
  @Matches(TIME_OF_DAY, { message: 'workStart must be HH:mm' })
  workStart?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_OF_DAY, { message: 'workEnd must be HH:mm' })
  workEnd?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(WEEKDAYS.length)
  @ArrayUnique()
  @IsIn(WEEKDAYS, { each: true })
  workingDays?: Weekday[];
}
