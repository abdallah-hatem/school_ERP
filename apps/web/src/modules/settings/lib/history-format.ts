import {
  HrCatalogueKey,
  HrListKey,
  HrSettingKey,
  LANGUAGES,
  SchoolSettingKey,
  WEEKDAYS,
  type Names,
} from '@school-erp/shared';
import { formatDays } from '@/shared/lib/format';
import { localName, type Locale, type Translate } from '@/shared/lib/i18n';

/*
 * How a settings change reads in the history list: which setting (`keyLabel`) and its old / new
 * value (`formatChangeValue`) in the current language. Unknown keys and shapes fall back to the
 * raw text, so a new setting never breaks the list.
 */

/** Stage edits are keyed per stage: `lists.stages.<id>` (core/school-structure). */
const STAGE_KEY_PREFIX = 'lists.stages.';

const KEY_LABELS: Record<string, string> = {
  [SchoolSettingKey.NAME_EN]: 'nameEn',
  [SchoolSettingKey.NAME_AR]: 'nameAr',
  [SchoolSettingKey.LOGO_URL]: 'logo',
  [SchoolSettingKey.DEFAULT_LANGUAGE]: 'defaultLanguage',
  [SchoolSettingKey.WORK_START]: 'workStart',
  [SchoolSettingKey.WORK_END]: 'workEnd',
  [SchoolSettingKey.WORKING_DAYS]: 'workingDays',
  [HrSettingKey.LATENESS_GRACE_MINUTES]: 'graceMinutes',
  [HrSettingKey.LATENESS_STEPS]: 'latenessSteps',
  [HrSettingKey.LATENESS_EXTRA_HOUR_DAYS]: 'extraHourDays',
  [HrSettingKey.PAYROLL_DAY_DIVISOR]: 'dayDivisor',
  [HrSettingKey.PAYROLL_PART_TIME]: 'partTime',
  [HrSettingKey.PENALTIES_REPETITION_WINDOW]: 'repetitionWindow',
  [HrListKey.DEPARTMENTS]: 'department',
  [HrListKey.JOB_TITLES]: 'jobTitle',
  [HrCatalogueKey.PENALTY_GROUPS]: 'penaltyGroup',
  [HrCatalogueKey.VIOLATIONS]: 'violation',
};

export function keyLabel(key: string, t: Translate, has: (key: string) => boolean): string {
  const label = KEY_LABELS[key] ?? (key.startsWith(STAGE_KEY_PREFIX) ? 'stage' : undefined);
  const messageKey = label ? `settings.history.keys.${label}` : null;
  return messageKey && has(messageKey) ? t(messageKey) : key;
}

const EMPTY = '—';

function isNames(value: unknown): value is Names & { isActive?: boolean } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Names).nameEn === 'string' &&
    typeof (value as Names).nameAr === 'string'
  );
}

function isStep(value: unknown): value is { hour: number; days: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { hour?: unknown }).hour === 'number' &&
    typeof (value as { days?: unknown }).days === 'number'
  );
}

/** A value as the history list shows it, in the current language. */
export function formatChangeValue(key: string, value: unknown, t: Translate, locale: Locale): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  const list = locale === 'ar' ? '، ' : ', ';

  if (typeof value === 'string') {
    if (key === SchoolSettingKey.DEFAULT_LANGUAGE && (LANGUAGES as readonly string[]).includes(value)) {
      return t(value === 'ar' ? 'common.common.arabic' : 'common.common.english');
    }
    if (key === HrSettingKey.PENALTIES_REPETITION_WINDOW) return t(`common.enums.repetitionWindow.${value}`);
    if (key === SchoolSettingKey.LOGO_URL) return value.split('/').pop() ?? value;
    return value;
  }
  if (typeof value === 'number') {
    if (key === HrSettingKey.LATENESS_EXTRA_HOUR_DAYS) return `${formatDays(value)} ${t('ui.units.days')}`;
    if (key === HrSettingKey.LATENESS_GRACE_MINUTES) return `${value} ${t('settings.units.minutes')}`;
    return String(value);
  }
  if (typeof value === 'boolean') return t(value ? 'common.common.yes' : 'common.common.no');

  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY;
    if (value.every((v) => typeof v === 'string' && (WEEKDAYS as readonly string[]).includes(v))) {
      return value.map((d: string) => t(`common.enums.weekday.${d}`)).join(list);
    }
    if (value.every(isStep)) {
      return value
        .map((s: { hour: number; days: number }) => t('settings.history.step', { hour: s.hour, days: formatDays(s.days) }))
        .join(list);
    }
    return value.map((v) => formatChangeValue(key, v, t, locale)).join(list);
  }

  if (typeof value === 'object') {
    if (isNames(value)) {
      const name = localName(value, locale);
      return value.isActive === false ? t('settings.history.hiddenItem', { name }) : name;
    }
    if (key === HrSettingKey.PAYROLL_PART_TIME) {
      return Object.entries(value as Record<string, number>)
        .map(([system, pct]) => `${t(`common.enums.workSystem.${system}`)}: ${pct}%`)
        .join(list);
    }
  }
  return JSON.stringify(value);
}
