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
  MaxLength,
} from 'class-validator';
import {
  LANGUAGES,
  WEEKDAYS,
  type Language,
  type UpdateSchoolSettingsRequest,
  type Weekday,
} from '@school-erp/shared';
import { IsWorkTime } from '../../../common/validators/is-work-time.decorator';

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
  @IsWorkTime()
  workStart?: string;

  @IsOptional()
  @IsString()
  @IsWorkTime()
  workEnd?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(WEEKDAYS.length)
  @ArrayUnique()
  @IsIn(WEEKDAYS, { each: true })
  workingDays?: Weekday[];

  /** The school address printed on contracts (empty = not set). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  addressEn?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  addressAr?: string;

  /** Who signs contracts for the school, and their title (empty = not set). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  signatoryNameEn?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  signatoryNameAr?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  signatoryTitleEn?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  signatoryTitleAr?: string;
}
