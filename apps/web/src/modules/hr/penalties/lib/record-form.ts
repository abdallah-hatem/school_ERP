import { ErrorCode, type CreatePenaltyRequest } from '@school-erp/shared';
import { z } from 'zod';
import { todayIso } from '@/shared/lib/format';

/*
 * The "Record a penalty" form's rules (§4) and request. Messages are translation keys so the one
 * schema serves both languages.
 */

export const NOTE_MAX = 1000;
const REQUIRED = 'ui.form.required';

export const recordPenaltySchema = z.object({
  employeeId: z.string().min(1, REQUIRED),
  violationId: z.string().min(1, REQUIRED),
  date: z
    .string()
    .nullable()
    .refine((v) => Boolean(v), REQUIRED)
    // ISO dates compare as text; "today" is read when the form validates, not when it opened.
    .refine((v) => !v || v <= todayIso(), 'penalties.form.futureDate'),
  note: z.string().trim().max(NOTE_MAX, 'penalties.form.tooLong'),
});

export type RecordPenaltyValues = z.input<typeof recordPenaltySchema>;

export function emptyRecordForm(employeeId = ''): RecordPenaltyValues {
  return { employeeId, violationId: '', date: todayIso(), note: '' };
}

export function formToRequest(values: RecordPenaltyValues): CreatePenaltyRequest {
  const note = values.note.trim();
  return {
    employeeId: values.employeeId,
    violationId: values.violationId,
    date: values.date ?? todayIso(),
    note: note === '' ? null : note,
  };
}

/** Server rule errors that belong under one field of the form (the rest show above the buttons). */
export function fieldForError(code: unknown): keyof RecordPenaltyValues | null {
  switch (code) {
    case ErrorCode.EMPLOYEE_INACTIVE:
      return 'employeeId';
    case ErrorCode.VIOLATION_RETIRED:
      return 'violationId';
    // §4 once per day: the date is what to change (or the violation, if it was the wrong one).
    case ErrorCode.VIOLATION_ONCE_PER_DAY:
      return 'date';
    default:
      return null;
  }
}
