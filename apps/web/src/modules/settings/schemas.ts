import {
  isOnWorkTimeStep,
  isValidDays,
  Language,
  levelNumberKind,
  levelValueProblem,
  storedLevelDays,
  MAX_VIOLATION_LEVELS,
  MIN_VIOLATION_LEVELS,
  NOTIFICATION_RETENTION_LIMITS,
  type PenaltyEffect,
  type ViolationLevelInput,
  RepetitionWindow,
  SETTING_LIMITS,
  TAX_BRACKETS_MAX,
  taxRuleIssues,
  violationLevelsProblem,
  Weekday,
} from '@school-erp/shared';
import { z } from 'zod';

/*
 * Form schemas. Messages are translation keys so one schema serves both languages (FieldShell
 * translates them). Business limits come from `@school-erp/shared` — never restated here.
 */

/** Name lengths from §7 / the API's DTOs. */
export const NAME_MAX = { school: 200, list: 100, group: 200, violation: 300, address: 300, signatory: 100 } as const;
export const NOTE_MAX = 1000;

const required = 'ui.form.required';

function name(max: keyof typeof NAME_MAX) {
  return z.string().trim().min(1, required).max(NAME_MAX[max], `settings.errors.max.${max}`);
}

/** An optional text ('' = not set), trimmed, at most its §7 length. */
function optionalText(max: keyof typeof NAME_MAX) {
  return z.string().trim().max(NAME_MAX[max], `settings.errors.max.${max}`);
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
    workStart: z.string().refine(isOnWorkTimeStep, 'settings.errors.time'),
    workEnd: z.string().refine(isOnWorkTimeStep, 'settings.errors.time'),
    workingDays: z.array(z.enum(Weekday)).min(1, 'settings.errors.workingDays'),
    // For contracts (contract templates spec, §7): optional ('' = not set).
    addressEn: optionalText('address'),
    addressAr: optionalText('address'),
    signatoryNameEn: optionalText('signatory'),
    signatoryNameAr: optionalText('signatory'),
    signatoryTitleEn: optionalText('signatory'),
    signatoryTitleAr: optionalText('signatory'),
  })
  .refine((v) => !isOnWorkTimeStep(v.workStart) || !isOnWorkTimeStep(v.workEnd) || v.workEnd > v.workStart, { path: ['workEnd'], error: 'settings.errors.workHoursOrder' });
export type SchoolFormValues = z.infer<typeof schoolSchema>;

// ── Lists (stages, departments, job titles) and catalogue groups ─────────────

/**
 * A name pair: both required, at most 100 (lists) or 200 (catalogue groups) characters. Job titles
 * also carry the "Manages people" switch (§3); the other lists leave it out.
 */
export function namesSchema(max: 'list' | 'group') {
  return z.object({ nameEn: name(max), nameAr: name(max), managesPeople: z.boolean().optional() });
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
  defaultProbationMonths: wholeNumber(
    SETTING_LIMITS.probationMonthsMin,
    SETTING_LIMITS.probationMonthsMax,
    'settings.errors.probationMonths',
  ),
});
export type HrRulesFormValues = z.infer<typeof hrRulesSchema>;

// ── Accounting rules (§10) ───────────────────────────────────────────────────

/** A rate from 0 up to (not including) 100, with at most 2 decimals. */
const rate = z
  .number({ error: required })
  .min(0, 'settings.errors.rate')
  .lt(100, 'settings.errors.rate')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'settings.errors.rate');

/**
 * The payroll tax rule. Every slice has a width except the last ("the rest"), whose width the
 * form keeps as null. The whole rule is checked by the shared `taxRuleIssues` — the API's check.
 */
export const accountingRulesSchema = z.object({
  payroll: z
    .object({
      brackets: z
        .array(z.object({ width: z.number({ error: required }).nullable(), percent: rate }))
        .min(1)
        .max(TAX_BRACKETS_MAX),
      martyrPercent: rate,
      insurancePercent: rate,
    })
    .superRefine((value, ctx) => {
      value.brackets.forEach((b, i) => {
        const last = i === value.brackets.length - 1;
        if (!last && (b.width == null || !Number.isInteger(b.width) || b.width <= 0)) {
          ctx.addIssue({ code: 'custom', path: ['brackets', i, 'width'], message: 'settings.errors.bracketWidth' });
        }
      });
      for (const { issue, index } of taxRuleIssues(value)) {
        if (issue === 'bracketPlusFund' && index !== undefined) {
          ctx.addIssue({ code: 'custom', path: ['brackets', index, 'percent'], message: 'settings.errors.bracketPlusFund' });
        }
      }
    }),
});
export type AccountingRulesFormValues = z.infer<typeof accountingRulesSchema>;

// ── Violation (catalogue) ────────────────────────────────────────────────────

/** A level's action's effect, from the actions the editor knows (unknown → none yet). */
export type EffectOf = (actionId: string) => PenaltyEffect | undefined;

/**
 * The violation editor's form (spec 2026-11-25): names, note, once-per-day and its 1–5 levels, each
 * an action and ONE number (`value`) whose unit follows the action's effect — days, a percent, or an
 * amount in piastres (the shared `MoneyField`); none for Record only. Validated live with the
 * shared `levelValueProblem` / `violationLevelsProblem` — the API runs the same rules. `effectOf`
 * is read at validation time (the actions arrive after the form opens).
 */
export function violationSchema(effectOf: EffectOf) {
  return z
    .object({
      nameEn: name('violation'),
      nameAr: name('violation'),
      note: z.string().max(NOTE_MAX, 'settings.errors.max.note'),
      /** §4: at most one pending/approved penalty per employee per date. */
      oncePerDay: z.boolean(),
      /** Level `i` is level `i + 1`; numbered on save, so the list is always 1..n. */
      levels: z
        .array(z.object({ actionId: z.string().min(1, 'settings.catalogue.problems.ACTION_REQUIRED'), value: z.number().nullable() }))
        .min(MIN_VIOLATION_LEVELS, 'settings.catalogue.problems.COUNT')
        .max(MAX_VIOLATION_LEVELS, 'settings.catalogue.problems.COUNT'),
    })
    .superRefine((value, ctx) => {
      // The shared rules decide — the same ones the API runs (one implementation).
      const inputs = toLevelInputs(value.levels, effectOf);
      inputs.forEach((level, i) => {
        const effect = effectOf(level.actionId);
        const problem = effect ? levelValueProblem(effect, level) : null;
        if (problem) {
          ctx.addIssue({ code: 'custom', path: ['levels', i, 'value'], message: `settings.catalogue.problems.${problem}` });
        }
      });
      const whole = violationLevelsProblem(inputs.map((l) => ({ level: l.level })));
      if (whole === 'COUNT' || whole === 'NUMBERING') {
        ctx.addIssue({ code: 'custom', path: ['levels'], message: `settings.catalogue.problems.${whole}` });
      }
    });
}
export type ViolationFormValues = z.infer<ReturnType<typeof violationSchema>>;

/**
 * Form rows → the contract's levels: numbered 1..n, and the one number put where the action's
 * effect takes it (`days`, `percent` or `amount`); none for an action that takes none (the field is
 * disabled for those, so a value left from another action never counts).
 */
export function toLevelInputs(levels: ViolationFormValues['levels'], effectOf: EffectOf): ViolationLevelInput[] {
  return levels.map((l, i) => {
    const effect = effectOf(l.actionId);
    const kind = effect ? levelNumberKind(effect) : null;
    return {
      level: i + 1,
      actionId: l.actionId,
      days: kind === 'days' && effect ? storedLevelDays(effect, l.value) : null,
      percent: kind === 'percent' ? l.value : null,
      amount: kind === 'amount' ? l.value : null,
    };
  });
}

// ── Notifications (§11) ──────────────────────────────────────────────────────

const retentionDays = () =>
  wholeNumber(NOTIFICATION_RETENTION_LIMITS.min, NOTIFICATION_RETENTION_LIMITS.max, 'notifications.settings.errors.retention');
const checkDay = () => wholeNumber(SETTING_LIMITS.checkDayMin, SETTING_LIMITS.checkDayMax, 'notifications.settings.errors.checkDay');

/**
 * The reminder timings (HR rules, spec → Reminder settings): the first contract reminder 1–120
 * days, the second 0 (none) – 60 and fewer than the first, probation 1–60, the check days 1–31,
 * renewal decisions 1–180 days before 31 May, the notice window's close 1–60 days before it.
 */
export const reminderTimingSchema = z
  .object({
    contractEndDays: wholeNumber(
      SETTING_LIMITS.contractEndDaysMin,
      SETTING_LIMITS.contractEndDaysMax,
      'notifications.settings.errors.contractEndDays',
    ),
    contractEndSecondDays: wholeNumber(
      SETTING_LIMITS.contractEndSecondDaysMin,
      SETTING_LIMITS.contractEndSecondDaysMax,
      'notifications.settings.errors.contractEndSecondDays',
    ),
    probationEndDays: wholeNumber(
      SETTING_LIMITS.probationEndDaysMin,
      SETTING_LIMITS.probationEndDaysMax,
      'notifications.settings.errors.probationEndDays',
    ),
    latenessCheckDay: checkDay(),
    payrollCheckDay: checkDay(),
    // Contracts (spec 2026-11-24, §11): renewal decisions from N days before 31 May; the notice
    // window's close N days before the deadline.
    renewalDecisionsDays: wholeNumber(
      SETTING_LIMITS.renewalDecisionsDaysMin,
      SETTING_LIMITS.renewalDecisionsDaysMax,
      'notifications.settings.errors.renewalDecisionsDays',
    ),
    noticeWindowCloseDays: wholeNumber(
      SETTING_LIMITS.noticeWindowCloseDaysMin,
      SETTING_LIMITS.noticeWindowCloseDaysMax,
      'notifications.settings.errors.noticeWindowCloseDays',
    ),
  })
  .refine((v) => v.contractEndSecondDays === 0 || v.contractEndSecondDays < v.contractEndDays, {
    path: ['contractEndSecondDays'],
    error: 'notifications.settings.errors.contractEndSecondDays',
  });

/**
 * Settings → Notifications: the school's default per type (in the registry's order), the
 * retention, and — for whoever may read HR rules — the probation length and the reminder timings.
 */
export const notificationSettingsSchema = z.object({
  defaults: z.array(z.boolean()),
  retention: z.object({ readDays: retentionDays(), resolvedDays: retentionDays(), maxDays: retentionDays() }),
  hr: z
    .object({
      defaultProbationMonths: wholeNumber(
        SETTING_LIMITS.probationMonthsMin,
        SETTING_LIMITS.probationMonthsMax,
        'settings.errors.probationMonths',
      ),
      reminders: reminderTimingSchema.optional(),
    })
    .optional(),
});
export type NotificationSettingsFormValues = z.infer<typeof notificationSettingsSchema>;
export type ReminderTimingValues = z.infer<typeof reminderTimingSchema>;
