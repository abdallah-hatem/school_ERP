import {
  CONTRACT_END_REASONS,
  calendarYearOfContract,
  earlyTerminationTiming,
  formatContractYear,
  noticeTiming,
  type CalendarTiming,
  type IsoDate,
  type SchoolCalendarDates,
} from '@school-erp/shared';
import { z } from 'zod';
import { formatDate, todayIso } from '@/shared/lib/format';
import type { Locale, Translate, TranslateValues } from '@/shared/lib/i18n';

/*
 * The decision sheet's and the end dialog's rules. Messages are translation keys so one schema
 * serves both languages.
 */

export const NOTE_MAX = 1000;
const REQUIRED = 'ui.form.required';

/** The sheet's choices, in the mockup's order. */
export const DECISION_CHOICES = ['RENEW', 'NOT_RENEWING', 'NOTICE', 'EARLY_TERMINATION'] as const;
export type DecisionChoice = (typeof DECISION_CHOICES)[number];

/** Choices that are dated (when the letter or the request was received). */
export const DATED_CHOICES: readonly DecisionChoice[] = ['NOTICE', 'EARLY_TERMINATION'];

export const decisionSchema = z
  .object({
    choice: z.string(),
    date: z.string().nullable(),
    note: z.string().trim().max(NOTE_MAX, 'contracts.form.tooLong'),
  })
  .superRefine((v, ctx) => {
    if (!(DECISION_CHOICES as readonly string[]).includes(v.choice)) {
      ctx.addIssue({ code: 'custom', path: ['choice'], message: REQUIRED });
    }
    if ((DATED_CHOICES as readonly string[]).includes(v.choice)) {
      if (!v.date) ctx.addIssue({ code: 'custom', path: ['date'], message: REQUIRED });
      // A letter or a request can't be received tomorrow; ISO dates compare as text.
      else if (v.date > todayIso()) ctx.addIssue({ code: 'custom', path: ['date'], message: 'contracts.form.futureDate' });
    }
  });
export type DecisionValues = z.input<typeof decisionSchema>;

export const endSchema = z.object({
  reason: z.string().refine((v) => (CONTRACT_END_REASONS as readonly string[]).includes(v), REQUIRED),
  endsOn: z
    .string()
    .nullable()
    .refine((v) => Boolean(v), REQUIRED),
  note: z.string().trim().min(1, REQUIRED).max(NOTE_MAX, 'contracts.form.tooLong'),
});
export type EndValues = z.input<typeof endSchema>;

/**
 * The line under a dated choice's date (spec edge cases 6, 7): where a notice or a request falls
 * against the year's school calendar — read with the shared `noticeTiming` / `earlyTerminationTiming`,
 * the rule the API applies. `calendar` undefined: not known (it couldn't be read) → no line.
 */
export function timingLine(
  choice: DecisionChoice,
  date: IsoDate | null | undefined,
  contractStart: IsoDate,
  calendar: SchoolCalendarDates | null | undefined,
  t: Translate,
  locale: Locale,
): { timing: CalendarTiming; text: string } | null {
  if (!date || calendar === undefined) return null;
  if (choice !== 'NOTICE' && choice !== 'EARLY_TERMINATION') return null;
  const year = formatContractYear(calendarYearOfContract(contractStart));
  const day = (d: IsoDate | undefined) => (d ? formatDate(d, locale) : '');
  // Every value a message may name; each message picks the ones it uses.
  const values: TranslateValues = { year };
  if (choice === 'NOTICE') {
    const timing = noticeTiming(date, calendar);
    values.date = day(timing === 'EARLY' ? calendar?.term2Start : calendar?.nonRenewalDeadline);
    values.deadline = day(calendar?.nonRenewalDeadline);
    return { timing, text: t(`contracts.decide.noticeTiming.${timing}`, values) };
  }
  const timing = earlyTerminationTiming(date, calendar);
  values.date = day(timing === 'EARLY' ? calendar?.term1Start : calendar?.term1End);
  return { timing, text: t(`contracts.decide.earlyTiming.${timing}`, values) };
}
