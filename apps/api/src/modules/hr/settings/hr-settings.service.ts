import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  HrSettingKey,
  PART_TIME_WORK_SYSTEMS,
  SETTING_DEFAULTS,
  type HrSettings,
  type LatenessStep,
  type PartTimeWorkSystem,
  type ReminderRule,
  type SettingValueMap,
} from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import { SettingsService } from '../../../core/settings';
import { UpdateHrSettingsDto } from './dto/update-hr-settings.dto';

type HrValues = { [K in HrSettingKey]: SettingValueMap[K] };

const HR_KEYS = Object.values(HrSettingKey);

/** Where each reminder timing is stored (§11, N3). */
const REMINDER_KEYS = {
  contractEndDays: HrSettingKey.REMINDERS_CONTRACT_END_DAYS,
  contractEndSecondDays: HrSettingKey.REMINDERS_CONTRACT_END_SECOND_DAYS,
  probationEndDays: HrSettingKey.REMINDERS_PROBATION_END_DAYS,
  latenessCheckDay: HrSettingKey.REMINDERS_LATENESS_CHECK_DAY,
  payrollCheckDay: HrSettingKey.REMINDERS_PAYROLL_CHECK_DAY,
  renewalDecisionsDays: HrSettingKey.REMINDERS_RENEWAL_DECISIONS_DAYS,
  noticeWindowCloseDays: HrSettingKey.REMINDERS_NOTICE_WINDOW_CLOSE_DAYS,
} as const satisfies Record<keyof ReminderRule, HrSettingKey>;

const REMINDER_FIELDS = Object.keys(REMINDER_KEYS) as (keyof ReminderRule)[];

/**
 * The keys a payroll line is calculated from (§5, §6): the lateness rule and the payroll rule. The
 * penalty repetition window only decides a penalty's level when it is recorded, not the run.
 */
const PAYROLL_RULE_KEYS = [
  HrSettingKey.LATENESS_GRACE_MINUTES,
  HrSettingKey.LATENESS_STEPS,
  HrSettingKey.LATENESS_EXTRA_HOUR_DAYS,
  HrSettingKey.PAYROLL_DAY_DIVISOR,
  HrSettingKey.PAYROLL_PART_TIME,
] as const;

/** Canonical JSON (object keys sorted) so equal values compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function sortSteps(steps: readonly LatenessStep[]): LatenessStep[] {
  return [...steps].map(({ hour, days }) => ({ hour, days })).sort((a, b) => a.hour - b.hour);
}

/**
 * HR rule settings (§3, §5, §6, §7, §11): lateness rule, payroll rule, penalty repetition window, a
 * new employee's default probation length, the reminder timings. Stored one
 * row per key with the §7 defaults behind them, through core's `SettingsService` (HR never writes
 * core's table). A save is one `hr.settings.update` audit entry listing the changed keys — the
 * Settings history (D9).
 */
@Injectable()
export class HrSettingsService {
  constructor(private readonly settings: SettingsService) {}

  async get(): Promise<HrSettings> {
    return this.toResponse(await this.load());
  }

  /** A new employee's default probation length in months (§3, §7; 0 = no probation). */
  async defaultProbationMonths(): Promise<number> {
    return (await this.load())[HrSettingKey.EMPLOYEES_DEFAULT_PROBATION_MONTHS];
  }

  /** When HR's reminders go out (§11, N3) — read by the daily reminders job. */
  async reminders(): Promise<ReminderRule> {
    return this.toResponse(await this.load()).reminders;
  }

  /** When the rules a payroll run is calculated from last changed, or null (never: defaults). */
  payrollRulesChangedAt(): Promise<Date | null> {
    return this.settings.lastChangedAt(PAYROLL_RULE_KEYS);
  }

  async update(dto: UpdateHrSettingsDto, changedById: string | null): Promise<HrSettings> {
    const old = await this.load();
    const next: HrValues = { ...old };

    const { lateness, payroll, penalties, employees, reminders } = dto;
    if (lateness?.graceMinutes !== undefined) {
      next[HrSettingKey.LATENESS_GRACE_MINUTES] = lateness.graceMinutes;
    }
    if (lateness?.steps !== undefined)
      next[HrSettingKey.LATENESS_STEPS] = sortSteps(lateness.steps);
    if (lateness?.extraHourDays !== undefined) {
      next[HrSettingKey.LATENESS_EXTRA_HOUR_DAYS] = lateness.extraHourDays;
    }
    if (payroll?.dayDivisor !== undefined) {
      next[HrSettingKey.PAYROLL_DAY_DIVISOR] = payroll.dayDivisor;
    }
    if (payroll?.partTime !== undefined) {
      const merged = { ...old[HrSettingKey.PAYROLL_PART_TIME] };
      for (const ws of PART_TIME_WORK_SYSTEMS) {
        const pct = payroll.partTime[ws];
        if (pct !== undefined) merged[ws] = pct;
      }
      next[HrSettingKey.PAYROLL_PART_TIME] = merged;
    }
    if (penalties?.repetitionWindow !== undefined) {
      next[HrSettingKey.PENALTIES_REPETITION_WINDOW] = penalties.repetitionWindow;
    }
    if (employees?.defaultProbationMonths !== undefined) {
      next[HrSettingKey.EMPLOYEES_DEFAULT_PROBATION_MONTHS] = employees.defaultProbationMonths;
    }
    for (const field of REMINDER_FIELDS) {
      const value = reminders?.[field];
      if (value !== undefined) next[REMINDER_KEYS[field]] = value;
    }
    // The second contract reminder comes after the first: fewer days before the end (0 = none).
    // Checked on the merged values, so sending one of the two is checked against the stored other.
    const second = next[HrSettingKey.REMINDERS_CONTRACT_END_SECOND_DAYS];
    if (second !== 0 && second >= next[HrSettingKey.REMINDERS_CONTRACT_END_DAYS]) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_REMINDER_DAYS);
    }

    const changed = HR_KEYS.filter((key) => canonical(old[key]) !== canonical(next[key]));
    // Core writes the changed keys and records one `hr.settings.update` entry listing them, in the
    // request's transaction (D2). Always called, so an unchanged save still answers `@Audited`
    // (core records nothing then).
    await this.settings.setValues(
      'hr',
      Object.fromEntries(changed.map((key) => [key, next[key]])),
      changedById,
    );

    return this.toResponse(next);
  }

  /** Stored values over the §7 defaults (core's SettingsService fills the defaults in). */
  private async load(): Promise<HrValues> {
    const stored = await this.settings.getValues(HR_KEYS);
    const pick = <K extends HrSettingKey>(key: K): SettingValueMap[K] =>
      (stored[key] ?? SETTING_DEFAULTS[key]) as SettingValueMap[K];

    const partTime = pick(HrSettingKey.PAYROLL_PART_TIME);
    return {
      [HrSettingKey.LATENESS_GRACE_MINUTES]: pick(HrSettingKey.LATENESS_GRACE_MINUTES),
      [HrSettingKey.LATENESS_STEPS]: sortSteps(pick(HrSettingKey.LATENESS_STEPS)),
      [HrSettingKey.LATENESS_EXTRA_HOUR_DAYS]: pick(HrSettingKey.LATENESS_EXTRA_HOUR_DAYS),
      [HrSettingKey.PAYROLL_DAY_DIVISOR]: pick(HrSettingKey.PAYROLL_DAY_DIVISOR),
      // A stored part-time object missing a key falls back to that key's default.
      [HrSettingKey.PAYROLL_PART_TIME]: Object.fromEntries(
        PART_TIME_WORK_SYSTEMS.map((ws) => [
          ws,
          partTime[ws] ?? SETTING_DEFAULTS[HrSettingKey.PAYROLL_PART_TIME][ws],
        ]),
      ) as Record<PartTimeWorkSystem, number>,
      [HrSettingKey.PENALTIES_REPETITION_WINDOW]: pick(HrSettingKey.PENALTIES_REPETITION_WINDOW),
      [HrSettingKey.EMPLOYEES_DEFAULT_PROBATION_MONTHS]: pick(HrSettingKey.EMPLOYEES_DEFAULT_PROBATION_MONTHS),
      [HrSettingKey.REMINDERS_CONTRACT_END_DAYS]: pick(HrSettingKey.REMINDERS_CONTRACT_END_DAYS),
      [HrSettingKey.REMINDERS_CONTRACT_END_SECOND_DAYS]: pick(
        HrSettingKey.REMINDERS_CONTRACT_END_SECOND_DAYS,
      ),
      [HrSettingKey.REMINDERS_PROBATION_END_DAYS]: pick(HrSettingKey.REMINDERS_PROBATION_END_DAYS),
      [HrSettingKey.REMINDERS_LATENESS_CHECK_DAY]: pick(HrSettingKey.REMINDERS_LATENESS_CHECK_DAY),
      [HrSettingKey.REMINDERS_PAYROLL_CHECK_DAY]: pick(HrSettingKey.REMINDERS_PAYROLL_CHECK_DAY),
      [HrSettingKey.REMINDERS_RENEWAL_DECISIONS_DAYS]: pick(HrSettingKey.REMINDERS_RENEWAL_DECISIONS_DAYS),
      [HrSettingKey.REMINDERS_NOTICE_WINDOW_CLOSE_DAYS]: pick(HrSettingKey.REMINDERS_NOTICE_WINDOW_CLOSE_DAYS),
    };
  }

  private toResponse(v: HrValues): HrSettings {
    return {
      lateness: {
        graceMinutes: v[HrSettingKey.LATENESS_GRACE_MINUTES],
        steps: v[HrSettingKey.LATENESS_STEPS],
        extraHourDays: v[HrSettingKey.LATENESS_EXTRA_HOUR_DAYS],
      },
      payroll: {
        dayDivisor: v[HrSettingKey.PAYROLL_DAY_DIVISOR],
        partTime: v[HrSettingKey.PAYROLL_PART_TIME],
      },
      penalties: { repetitionWindow: v[HrSettingKey.PENALTIES_REPETITION_WINDOW] },
      employees: { defaultProbationMonths: v[HrSettingKey.EMPLOYEES_DEFAULT_PROBATION_MONTHS] },
      reminders: {
        contractEndDays: v[REMINDER_KEYS.contractEndDays],
        contractEndSecondDays: v[REMINDER_KEYS.contractEndSecondDays],
        probationEndDays: v[REMINDER_KEYS.probationEndDays],
        latenessCheckDay: v[REMINDER_KEYS.latenessCheckDay],
        payrollCheckDay: v[REMINDER_KEYS.payrollCheckDay],
        renewalDecisionsDays: v[REMINDER_KEYS.renewalDecisionsDays],
        noticeWindowCloseDays: v[REMINDER_KEYS.noticeWindowCloseDays],
      },
    };
  }
}
