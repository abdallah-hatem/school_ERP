import {
  MAX_PIASTRES,
  TAX_BRACKETS_MAX,
  type TaxBracket,
  type UpdateAccountingSettingsRequest,
} from '@school-erp/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../../../../common/validators/is-optional-not-null.decorator';

/** The largest percent with at most 2 decimals that is under 100 (§10 tax rule: 0 ≤ p < 100). */
const PERCENT_MAX = 99.99;
const PERCENT = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false } as const;

export class TaxBracketDto implements TaxBracket {
  /** Whole piastres > 0; null only on the last (open-ended) slice — checked on the merged rule. */
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PIASTRES)
  width: number | null;

  @IsNumber(PERCENT)
  @Min(0)
  @Max(PERCENT_MAX)
  percent: number;
}

export class UpdatePayrollTaxRuleDto {
  /** Replaces the whole table. */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TAX_BRACKETS_MAX)
  @ValidateNested({ each: true })
  @Type(() => TaxBracketDto)
  brackets?: TaxBracketDto[];

  @IsOptionalNotNull()
  @IsNumber(PERCENT)
  @Min(0)
  @Max(PERCENT_MAX)
  martyrPercent?: number;

  @IsOptionalNotNull()
  @IsNumber(PERCENT)
  @Min(0)
  @Max(PERCENT_MAX)
  insurancePercent?: number;
}

/** `PATCH /accounting/settings` — any subset. Unknown keys at any level → 400 (whitelist). */
export class UpdateAccountingSettingsDto implements UpdateAccountingSettingsRequest {
  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdatePayrollTaxRuleDto)
  payroll?: UpdatePayrollTaxRuleDto;
}
