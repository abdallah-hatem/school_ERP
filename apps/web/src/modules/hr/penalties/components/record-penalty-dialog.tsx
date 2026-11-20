'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PenaltyPreview } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useFormState, useWatch } from 'react-hook-form';
import { callApi } from '@/lib/callApi';
import { DateField, SelectField, TextareaField, type SelectOption, type SelectOptionGroup } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { PenaltiesIcon } from '@/shared/components/ui/icons';
import { formatCount, todayIso } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_PENALTY, GET_PENALTY_PREVIEW } from '../apis';
import { describeAction, errorMessage } from '../lib/penalty-text';
import { RecountList } from './recount-list';
import {
  emptyRecordForm,
  fieldForError,
  formToRequest,
  NOTE_MAX,
  recordPenaltySchema,
  type RecordPenaltyValues,
} from '../lib/record-form';

export interface RecordPenaltyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active employees (`employeeOptions`). */
  employees: SelectOption[];
  /** Violations in use, by catalogue group (`violationGroups`). */
  violations: SelectOptionGroup[];
  /** Pre-picked employee (the profile tab). */
  employeeId?: string;
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; preview: PenaltyPreview }
  | { kind: 'error'; message: string };

/**
 * Record a penalty (§4): employee, violation, date (not in the future) and a note. While the three
 * are set, a live line shows the level and action the server would give ("Level 2 — Deduct 0.5
 * day"); only the latest answer is shown. Saves as pending; rule errors land on their field.
 */
export function RecordPenaltyDialog({ open, onOpenChange, employees, violations, employeeId }: RecordPenaltyDialogProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const formId = useId();
  const form = useForm<RecordPenaltyValues>({
    resolver: zodResolver(recordPenaltySchema),
    defaultValues: emptyRecordForm(employeeId),
  });
  const { control, handleSubmit, reset, setError } = form;
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ key: string; state: PreviewState } | null>(null);
  const previewSeq = useRef(0);

  const [watchedEmployee, watchedViolation, watchedDate] = useWatch({
    control,
    name: ['employeeId', 'violationId', 'date'],
  });

  // The preview's inputs, or null until all three are set (and the date isn't in the future).
  const previewKey =
    open && watchedEmployee && watchedViolation && watchedDate && watchedDate <= todayIso()
      ? `${watchedEmployee}|${watchedViolation}|${watchedDate}`
      : null;
  const preview: PreviewState =
    previewKey === null ? { kind: 'idle' } : answer?.key === previewKey ? answer.state : { kind: 'loading' };
  // A refused save puts its rule error under its field (once per day → the date). When the preview
  // already says the same, it steps aside: the message shows once (dry run 2026-11-18).
  const { errors } = useFormState({ control });
  const previewRepeatsFieldError =
    preview.kind === 'error' &&
    Object.values(errors).some((error) => error?.message === preview.message);

  // Live preview: one request per change of employee, violation or date; a slower earlier answer
  // never overwrites a later one.
  useEffect(() => {
    const seq = ++previewSeq.current;
    if (previewKey === null) return;
    const [employee = '', violation = '', date = ''] = previewKey.split('|');
    void callApi(GET_PENALTY_PREVIEW({ employeeId: employee, violationId: violation, date }), {
      showErrorToast: false,
    }).then((res) => {
      if (seq !== previewSeq.current || res.unauthorized) return;
      setAnswer({
        key: previewKey,
        state:
          res.success && res.data
            ? { kind: 'ready', preview: res.data }
            : { kind: 'error', message: errorMessage(res, t, has, t('penalties.preview.failed'), locale) },
      });
    });
  }, [previewKey, t, has, locale]);

  function change(next: boolean) {
    if (busy) return;
    if (!next) {
      reset(emptyRecordForm(employeeId));
      setFormError(null);
      setAnswer(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(values: RecordPenaltyValues) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const res = await callApi(CREATE_PENALTY(formToRequest(values)), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('penalties.form.saved'),
      });
      if (res.unauthorized) return;
      if (res.success) {
        reset(emptyRecordForm(employeeId));
        setAnswer(null);
        onOpenChange(false);
        router.refresh();
        return;
      }
      const message = errorMessage(res, t, has, t('penalties.form.saveFailed'), locale);
      const field = fieldForError(res.error);
      if (field) setError(field, { message }, { shouldFocus: true });
      else setFormError(message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        size="md"
        title={t('penalties.form.title')}
        description={t('penalties.form.description')}
        closeLabel={t('ui.dialog.close')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" className="cursor-pointer" disabled={busy}>
                {t('ui.dialog.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" form={formId} variant="primary" className="cursor-pointer" loading={busy}>
              {t('penalties.form.save')}
            </Button>
          </>
        }
      >
        <Form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          <SelectField
            searchable
            control={control}
            name="employeeId"
            label={t('penalties.form.employee')}
            required
            disabled={busy}
            placeholder={t('penalties.form.employeePlaceholder')}
            searchPlaceholder={t('penalties.form.employeeSearch')}
            options={employees}
            emptyText={t('penalties.form.noEmployees')}
            noMatchesText={t('penalties.form.noEmployeeMatches')}
          />
          <SelectField
            searchable
            control={control}
            name="violationId"
            label={t('penalties.form.violation')}
            required
            disabled={busy}
            placeholder={t('penalties.form.violationPlaceholder')}
            searchPlaceholder={t('penalties.form.violationSearch')}
            groups={violations}
            emptyText={t('penalties.form.noViolations')}
            noMatchesText={t('penalties.form.noViolationMatches')}
          />
          <DateField
            control={control}
            name="date"
            label={t('penalties.form.date')}
            required
            disabled={busy}
            placeholder={t('penalties.form.datePlaceholder')}
            hint={t('penalties.form.dateHint')}
            max={todayIso()}
          />
          {previewRepeatsFieldError ? null : <PreviewLine state={preview} />}
          {preview.kind === 'ready' ? (
            <RecountList recount={preview.preview.recount} note={t('penalties.recount.recordNote')} />
          ) : null}
          <TextareaField
            control={control}
            name="note"
            label={t('penalties.form.note')}
            disabled={busy}
            placeholder={t('penalties.form.notePlaceholder')}
            rows={3}
            maxLength={NOTE_MAX}
          />
          {formError ? (
            <p role="alert" className="rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm font-semibold text-destructive-ink">
              {formError}
            </p>
          ) : null}
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function PreviewLine({ state }: { state: PreviewState }) {
  const { t, locale } = useTranslation();
  let line: string;
  let detail: string | null = null;
  switch (state.kind) {
    case 'idle':
      line = t('penalties.preview.idle');
      break;
    case 'loading':
      line = t('penalties.preview.loading');
      break;
    case 'error':
      line = state.message;
      break;
    case 'ready': {
      const { level, action, days, priorCount } = state.preview;
      line = t('penalties.preview.line', { level, action: describeAction(t, locale, action, days) });
      detail =
        priorCount === 0
          ? t('penalties.preview.priorNone')
          : priorCount === 1
            ? t('penalties.preview.priorOne')
            : t('penalties.preview.priorMany', { count: formatCount(priorCount) });
      break;
    }
  }
  const tone =
    state.kind === 'ready'
      ? 'bg-warning-soft text-warning-ink'
      : state.kind === 'error'
        ? 'bg-destructive-soft text-destructive-ink'
        : 'bg-muted text-muted-foreground';
  return (
    <section
      aria-label={t('penalties.preview.label')}
      aria-busy={state.kind === 'loading' || undefined}
      className={cn('flex items-start gap-3 rounded-xl px-3.5 py-3', tone)}
    >
      <PenaltiesIcon className="mt-0.5 size-5 shrink-0" />
      <div aria-live="polite" className="flex min-w-0 flex-col gap-0.5">
        <p data-testid="penalty-preview" className="text-sm font-bold break-words">
          {line}
        </p>
        {detail ? <p className="text-xs">{detail}</p> : null}
      </div>
    </section>
  );
}
