import { Injectable } from '@nestjs/common';
import {
  HrSettingKey,
  PART_TIME_WORK_SYSTEMS,
  SETTING_DEFAULTS,
  type HrSettings,
  type LatenessStep,
  type PartTimeWorkSystem,
  type SettingValueMap,
} from '@school-erp/shared';
import { SettingsService } from '../../../core/settings';
import { UpdateHrSettingsDto } from './dto/update-hr-settings.dto';

type HrValues = { [K in HrSettingKey]: SettingValueMap[K] };

const HR_KEYS = Object.values(HrSettingKey);

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
 * HR rule settings (§5, §6, §7): lateness rule, payroll rule, penalty repetition window. Stored one
 * row per key with the §7 defaults behind them, through core's `SettingsService` (HR never writes
 * core's table). Every changed key emits one `settings.changed` after the write commits; core's
 * listener records the history row.
 */
@Injectable()
export class HrSettingsService {
  constructor(private readonly settings: SettingsService) {}

  async get(): Promise<HrSettings> {
    return this.toResponse(await this.load());
  }

  async update(dto: UpdateHrSettingsDto, changedById: string | null): Promise<HrSettings> {
    const old = await this.load();
    const next: HrValues = { ...old };

    const { lateness, payroll, penalties } = dto;
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

    const changed = HR_KEYS.filter((key) => canonical(old[key]) !== canonical(next[key]));
    if (changed.length > 0) {
      // Core writes the changed keys in one transaction, then emits one `settings.changed` per
      // key after the commit; its listener records exactly one history row each.
      await this.settings.setValues(
        'hr',
        Object.fromEntries(changed.map((key) => [key, next[key]])),
        changedById,
      );
    }

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
    };
  }
}
