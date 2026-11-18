import {
  REPETITION_WINDOWS,
  SETTING_LIMITS,
  type LatenessStep,
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
  IsObject,
  Max,
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

export class UpdateEmployeeRuleDto {
  /** Whole months, 0–6 (§7, N0); 0 = no probation. */
  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.probationMonthsMin)
  @Max(SETTING_LIMITS.probationMonthsMax)
  defaultProbationMonths?: number;
}

/** §11 (N3): when HR's reminders go out. The second contract reminder is checked against the first in the service. */
export class UpdateReminderRuleDto {
  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.contractEndDaysMin)
  @Max(SETTING_LIMITS.contractEndDaysMax)
  contractEndDays?: number;

  /** 0 = no second reminder. */
  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.contractEndSecondDaysMin)
  @Max(SETTING_LIMITS.contractEndSecondDaysMax)
  contractEndSecondDays?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.probationEndDaysMin)
  @Max(SETTING_LIMITS.probationEndDaysMax)
  probationEndDays?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.checkDayMin)
  @Max(SETTING_LIMITS.checkDayMax)
  latenessCheckDay?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(SETTING_LIMITS.checkDayMin)
  @Max(SETTING_LIMITS.checkDayMax)
  payrollCheckDay?: number;
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
  @Type(() => UpdateEmployeeRuleDto)
  employees?: UpdateEmployeeRuleDto;

  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateReminderRuleDto)
  reminders?: UpdateReminderRuleDto;
}
