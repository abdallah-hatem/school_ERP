import {
  MAX_PIASTRES,
  REPETITION_WINDOWS,
  SETTING_LIMITS,
  TAX_BRACKETS_MAX,
  type LatenessStep,
  type TaxBracket,
  type RepetitionWindow,
  type UpdateHrSettingsRequest,
} from '@school-erp/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  Max,
  ValidateIf,
  Min,
  ValidateBy,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { IsOptionalNotNull } from '../../../../common/validators/is-optional-not-null.decorator';
import { IsValidDays } from '../../../../common/validators/is-valid-days.decorator';

/** Hours of a month's maximum minutes (6,000 → 100): no rule needs more steps than that. */
const MAX_STEPS = Math.ceil(SETTING_LIMITS.latenessMinutesMax / 60);

/** The steps' hours are 1..n, each exactly once (any order; stored sorted). */
function HasSequentialHours(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'hasSequentialHours',
      validator: {
        validate: (value: unknown) => {
          if (!Array.isArray(value)) return false;
          const hours = value.map((s: Partial<LatenessStep> | null) => s?.hour);
          if (!hours.every((h): h is number => Number.isInteger(h))) return false;
          const sorted = [...hours].sort((a, b) => a - b);
          return sorted.every((h, i) => h === i + 1);
        },
        defaultMessage: () => '$property hours must be 1, 2, 3 … with no duplicates or gaps',
      },
    },
    options,
  );
}

export class LatenessStepDto implements LatenessStep {
  @IsInt()
  @Min(1)
  @Max(MAX_STEPS)
  hour: number;

  @IsValidDays()
  days: number;
}

export class UpdateLatenessRuleDto {
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(SETTING_LIMITS.latenessMinutesMax)
  graceMinutes?: number;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STEPS)
  @ValidateNested({ each: true })
  @Type(() => LatenessStepDto)
  @HasSequentialHours()
  steps?: LatenessStepDto[];

  @IsOptionalNotNull()
  @IsValidDays()
  extraHourDays?: number;
}

export class UpdatePartTimePercentsDto {
  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.percentMin)
  @Max(SETTING_LIMITS.percentMax)
  PART_TIME_4?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.percentMin)
  @Max(SETTING_LIMITS.percentMax)
  PART_TIME_3?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.percentMin)
  @Max(SETTING_LIMITS.percentMax)
  PART_TIME_2?: number;
}

export class UpdatePayrollRuleDto {
  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.dayDivisorMin)
  @Max(SETTING_LIMITS.dayDivisorMax)
  dayDivisor?: number;

  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdatePartTimePercentsDto)
  partTime?: UpdatePartTimePercentsDto;
}

export class UpdatePenaltyRuleDto {
  @IsOptionalNotNull()
  @IsIn(REPETITION_WINDOWS)
  repetitionWindow?: RepetitionWindow;
}

/** The largest percent with at most 2 decimals that is under 100 (§7 tax rule: 0 ≤ p < 100). */
const PERCENT_MAX = 99.99;

export class TaxBracketDto implements TaxBracket {
  /** Whole piastres > 0; null only on the last (open-ended) bracket — checked on the merged rule. */
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PIASTRES)
  width: number | null;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(PERCENT_MAX)
  percent: number;
}

export class UpdateTaxRuleDto {
  /** Replaces the whole table. */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TAX_BRACKETS_MAX)
  @ValidateNested({ each: true })
  @Type(() => TaxBracketDto)
  brackets?: TaxBracketDto[];

  @IsOptionalNotNull()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(PERCENT_MAX)
  martyrPercent?: number;

  @IsOptionalNotNull()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(PERCENT_MAX)
  insurancePercent?: number;
}

/** `PATCH /hr/settings` — any subset. Unknown keys at any level → 400 (whitelist). */
export class UpdateHrSettingsDto implements UpdateHrSettingsRequest {
  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateLatenessRuleDto)
  lateness?: UpdateLatenessRuleDto;

  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdatePayrollRuleDto)
  payroll?: UpdatePayrollRuleDto;

  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdatePenaltyRuleDto)
  penalties?: UpdatePenaltyRuleDto;

  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateTaxRuleDto)
  tax?: UpdateTaxRuleDto;
}
