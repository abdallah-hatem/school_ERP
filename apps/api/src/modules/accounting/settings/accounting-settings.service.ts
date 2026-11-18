import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AccountingSettingKey,
  ErrorCode,
  SETTING_DEFAULTS,
  taxRuleIssues,
  type AccountingSettings,
  type SettingValueMap,
  type TaxBracket,
  type TaxRule,
} from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import { SettingsService } from '../../../core/settings';
import { AfterCommit } from '../../../database/transactions';
import { AccountingTaxRuleRepository, BASELINE_EFFECTIVE_FROM } from './accounting-tax-rule.repository';
import { UpdateAccountingSettingsDto } from './dto/update-accounting-settings.dto';

type AccountingValues = { [K in AccountingSettingKey]: SettingValueMap[K] };

const KEYS = Object.values(AccountingSettingKey);

function cleanBrackets(brackets: readonly TaxBracket[]): TaxBracket[] {
  return brackets.map(({ width, percent }) => ({ width, percent }));
}

/** Canonical JSON (object keys sorted) so equal values compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Accounting's rule settings (§10): the payroll tax rule — monthly income-tax slices, the martyrs'
 * fund rate and the employee's insurance share. Stored one row per key behind the §10 defaults
 * through core's `SettingsService`, which records the audit entry in the same transaction. Every
 * change is also kept as a version from the moment it took effect, so an approved month is
 * always worked out with the rule in force at its approval.
 */
@Injectable()
export class AccountingSettingsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly taxRules: AccountingTaxRuleRepository,
    private readonly afterCommit: AfterCommit,
  ) {}

  async get(): Promise<AccountingSettings> {
    return toResponse(await this.load());
  }

  /**
   * The tax rule in force at `at` — what a month approved then is worked out with, whenever that
   * happens. With no version kept yet the rule has never changed since: today's is the answer.
   */
  async taxRuleAt(at: Date): Promise<TaxRule> {
    return (await this.taxRules.inForceAt(at)) ?? toResponse(await this.load()).payroll;
  }

  async update(dto: UpdateAccountingSettingsDto, changedById: string | null): Promise<AccountingSettings> {
    // The setting, its audit entry (core joins this transaction) and its version commit together;
    // `core.settings.changed` goes out after the commit — also when called outside a request.
    return this.afterCommit.inTransaction(async () => {
      const old = await this.load();
      const next: AccountingValues = { ...old };
      const payroll = dto.payroll;
      if (payroll?.brackets !== undefined) {
        next[AccountingSettingKey.PAYROLL_TAX_BRACKETS] = cleanBrackets(payroll.brackets);
      }
      if (payroll?.martyrPercent !== undefined) {
        next[AccountingSettingKey.PAYROLL_MARTYR_PERCENT] = payroll.martyrPercent;
      }
      if (payroll?.insurancePercent !== undefined) {
        next[AccountingSettingKey.PAYROLL_INSURANCE_PERCENT] = payroll.insurancePercent;
      }
      // Checked as a whole: only the last slice is open-ended, and a slice's rate plus the fund
      // stays under 100% so the gross-up has an answer.
      if (taxRuleIssues(toResponse(next).payroll).length > 0) {
        throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_TAX_RULE);
      }

      const changed = KEYS.filter((key) => canonical(old[key]) !== canonical(next[key]));
      // Always called, so an unchanged save still answers `@Audited` (core records nothing then).
      await this.settings.setValues(
        'accounting',
        Object.fromEntries(changed.map((key) => [key, next[key]])),
        changedById,
      );
      if (changed.length > 0) {
        // The first change kept: the rule before it, as the baseline every earlier month used.
        if (await this.taxRules.isEmpty()) {
          await this.taxRules.add(toResponse(old).payroll, BASELINE_EFFECTIVE_FROM, null);
        }
        await this.taxRules.add(toResponse(next).payroll, new Date(), changedById);
      }
      return toResponse(next);
    });
  }

  private async load(): Promise<AccountingValues> {
    const stored = await this.settings.getValues(KEYS);
    const pick = <K extends AccountingSettingKey>(key: K): SettingValueMap[K] =>
      (stored[key] ?? SETTING_DEFAULTS[key]) as SettingValueMap[K];
    return {
      [AccountingSettingKey.PAYROLL_TAX_BRACKETS]: pick(AccountingSettingKey.PAYROLL_TAX_BRACKETS),
      [AccountingSettingKey.PAYROLL_MARTYR_PERCENT]: pick(AccountingSettingKey.PAYROLL_MARTYR_PERCENT),
      [AccountingSettingKey.PAYROLL_INSURANCE_PERCENT]: pick(AccountingSettingKey.PAYROLL_INSURANCE_PERCENT),
    };
  }
}

function toResponse(v: AccountingValues): AccountingSettings {
  return {
    payroll: {
      brackets: v[AccountingSettingKey.PAYROLL_TAX_BRACKETS],
      martyrPercent: v[AccountingSettingKey.PAYROLL_MARTYR_PERCENT],
      insurancePercent: v[AccountingSettingKey.PAYROLL_INSURANCE_PERCENT],
    },
  };
}
