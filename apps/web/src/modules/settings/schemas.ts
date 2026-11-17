import {
  isValidDays,
  Language,
  levelDaysProblem,
  MAX_VIOLATION_LEVELS,
  MIN_VIOLATION_LEVELS,
  PENALTY_ACTIONS_ALLOWING_DAYS,
  PenaltyAction,
  RepetitionWindow,
  SETTING_LIMITS,
  violationLevelsProblem,
  Weekday,
} from '@school-erp/shared';
import { z } from 'zod';

/*
 * Form schemas. Messages are translation keys so one schema serves both languages (FieldShell
 * translates them). Business limits come from `@school-erp/shared` — never restated here.
 */

/** `HH:mm`, 24-hour, zero-padded — the API's format (two times then compare as text). */
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Name lengths from §7 / the API's DTOs. */
export const NAME_MAX = { school: 200, list: 100, group: 200, violation: 300 } as const;
export const NOTE_MAX = 1000;

const required = 'ui.form.required';

function name(max: keyof typeof NAME_MAX) {
  return z.string().trim().min(1, required).max(NAME_MAX[max], `settings.errors.max.${max}`);
}

/** A whole number field (the form holds `null` while it is empty). */
function wholeNumber(min: number, max: number, rangeKey: string) {
  return z
    .number({ error: required })
    .int(rangeKey)
    .min(min, rangeKey)
    .max(max, rangeKey);
}

/** A day count: a quarter step from 0 to 30 (§7), validated by the shared rule. */
const dayCount = z.number({ error: required }).refine(isValidDays, 'settings.errors.days');

// ── School ───────────────────────────────────────────────────────────────────

export const schoolSchema = z
  .object({
    nameEn: name('school'),
    nameAr: name('school'),
    defaultLanguage: z.enum(Language, { error: required }),
    workStart: z.string().trim().regex(TIME_OF_DAY, 'settings.errors.time'),
    workEnd: z.string().trim().regex(TIME_OF_DAY, 'settings.errors.time'),
    workingDays: z.array(z.enum(Weekday)).min(1, 'settings.errors.workingDays'),
  })
  .refine((v) => !TIME_OF_DAY.test(v.workStart) || !TIME_OF_DAY.test(v.workEnd) || v.workEnd > v.workStart, { path: ['workEnd'], error: 'settings.errors.workHoursOrder' });
export type SchoolFormValues = z.infer<typeof schoolSchema>;

// ── Lists (stages, departments, job titles) and catalogue groups ─────────────

/** A name pair: both required, at most 100 (lists) or 200 (catalogue groups) characters. */
export function namesSchema(max: 'list' | 'group') {
  return z.object({ nameEn: name(max), nameAr: name(max) });
}
export type NamesFormValues = z.infer<ReturnType<typeof namesSchema>>;

// ── HR rules ─────────────────────────────────────────────────────────────────

const percent = () => wholeNumber(SETTING_LIMITS.percentMin, SETTING_LIMITS.percentMax, 'settings.errors.percent');

export const hrRulesSchema = z.object({
  graceMinutes: wholeNumber(0, SETTING_LIMITS.latenessMinutesMax, 'settings.errors.grace'),
  /** Step `i` is hour `i + 1`; the hours are numbered on save. */
  steps: z.array(z.object({ days: dayCount })).min(1, 'settings.errors.stepsMin'),
  extraHourDays: dayCount,
  dayDivisor: wholeNumber(SETTING_LIMITS.dayDivisorMin, SETTING_LIMITS.dayDivisorMax, 'settings.errors.divisor'),
  partTime: z.object({ PART_TIME_4: percent(), PART_TIME_3: percent(), PART_TIME_2: percent() }),
  repetitionWindow: z.enum(RepetitionWindow, { error: required }),
});
export type HrRulesFormValues = z.infer<typeof hrRulesSchema>;

// ── Violation (catalogue) ────────────────────────────────────────────────────

export const violationSchema = z
  .object({
    nameEn: name('violation'),
    nameAr: name('violation'),
    note: z.string().max(NOTE_MAX, 'settings.errors.max.note'),
    /** Level `i` is level `i + 1`; numbered on save, so the list is always 1..n. */
    levels: z
      .array(z.object({ action: z.enum(PenaltyAction, { error: required }), days: z.number().nullable() }))
      .min(MIN_VIOLATION_LEVELS, 'settings.catalogue.problems.COUNT')
      .max(MAX_VIOLATION_LEVELS, 'settings.catalogue.problems.COUNT'),
  })
  .superRefine((value, ctx) => {
    // The shared rules decide — the same ones the API runs (one implementation).
    toLevelInputs(value.levels).forEach((level, i) => {
      const problem = levelDaysProblem(level.action, level.days);
      if (problem) {
        ctx.addIssue({ code: 'custom', path: ['levels', i, 'days'], message: `settings.catalogue.problems.${problem}` });
      }
    });
    const whole = violationLevelsProblem(toLevelInputs(value.levels));
    if (whole === 'COUNT' || whole === 'NUMBERING') {
      ctx.addIssue({ code: 'custom', path: ['levels'], message: `settings.catalogue.problems.${whole}` });
    }
  });
export type ViolationFormValues = z.infer<typeof violationSchema>;

/**
 * Form rows → the contract's levels: numbered 1..n, and `days` dropped for an action that takes
 * none (the days field is disabled for those, so a value left from another action never counts).
 */
export function toLevelInputs(levels: ViolationFormValues['levels']) {
  return levels.map((l, i) => ({
    level: i + 1,
    action: l.action,
    days: PENALTY_ACTIONS_ALLOWING_DAYS.includes(l.action) ? l.days : null,
  }));
}
