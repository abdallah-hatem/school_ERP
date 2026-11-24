'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { NonRenewalBy, renewedContractDates, type Contract } from '@school-erp/shared';
import { useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { callApi } from '@/lib/callApi';
import { DateField, TextareaField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { Button } from '@/shared/components/ui/button';
import { BlockedIcon, CloseIcon, EmailIcon, InfoIcon, PendingIcon, RecalculateIcon, WarningIcon, type AppIcon } from '@/shared/components/ui/icons';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/shared/components/ui/sheet';
import { TABLET_UP, useMediaQuery } from '@/shared/hooks/use-media-query';
import { formatDate, todayIso } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { NOT_RENEW_CONTRACT, RENEW_CONTRACTS, REQUEST_EARLY_TERMINATION } from '../apis';
import { contractError } from '../lib/contract-text';
import {
  DATED_CHOICES,
  decisionSchema,
  NOTE_MAX,
  timingLine,
  type DecisionChoice,
  type DecisionValues,
} from '../lib/decision-form';
import { ContractFileField, type UploadedFile } from './contract-file-field';

const CHOICE_ICON: Record<DecisionChoice, AppIcon> = {
  RENEW: RecalculateIcon,
  NOT_RENEWING: BlockedIcon,
  NOTICE: EmailIcon,
  EARLY_TERMINATION: PendingIcon,
};

/**
 * Deciding one contract (the mockup's "Decide" sheet): Renew, Not renewing — the school's decision,
 * the employee's notice (the date it was received, the scanned letter and a note) or an early
 * termination request. A dated choice says at once where it falls against the school calendar the
 * contract reads (`contract.calendars`, picked by the API) — "Early", "Late", "Calendar not set" —
 * with the shared rule. From the bottom on a phone, from the
 * inline-end edge on a tablet and up. Refusals keep it open with the reason.
 */
export function DecisionSheet({
  contract,
  choice: initialChoice,
  choices,
  onClose,
  onDone,
}: {
  /** The contract being decided; null closes the sheet. */
  contract: Contract | null;
  /** The choice it opens on (the ⋯ menu item picked); none: the person picks. */
  choice?: DecisionChoice;
  /** What may be chosen on this contract (renewable, decidable). */
  choices: readonly DecisionChoice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const side = useMediaQuery(TABLET_UP) ? 'end' : 'bottom';
  return (
    <Sheet open={contract !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent side={side} className={cn(side === 'bottom' && 'max-h-[calc(100dvh-2rem)]')}>
        {contract ? (
          <DecisionBody
            // A new contract or a new opening choice starts a fresh form.
            key={`${contract.id}:${initialChoice ?? ''}`}
            contract={contract}
            initialChoice={initialChoice}
            choices={choices}
            bottom={side === 'bottom'}
            onDone={onDone}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DecisionBody({
  contract,
  initialChoice,
  choices,
  bottom,
  onDone,
}: {
  contract: Contract;
  initialChoice?: DecisionChoice;
  choices: readonly DecisionChoice[];
  bottom: boolean;
  onDone: () => void;
}) {
  const { t, has, locale } = useTranslation();
  const formId = useId();
  const groupId = useId();
  const form = useForm<DecisionValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { choice: initialChoice ?? '', date: todayIso(), note: '' },
  });
  const [choice, date] = useWatch({ control: form.control, name: ['choice', 'date'] });
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const name = localName(contract.employee, locale);
  const next = renewedContractDates(contract.endsOn);
  const dated = (DATED_CHOICES as readonly string[]).includes(choice);
  const timing = dated
    ? timingLine(choice as DecisionChoice, date, contract.calendars, t, locale)
    : null;

  async function save(values: DecisionValues) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const note = values.note.trim() || null;
      const id = contract.id;
      const request =
        values.choice === 'RENEW'
          ? RENEW_CONTRACTS([id])
          : values.choice === 'NOT_RENEWING'
            ? NOT_RENEW_CONTRACT(id, { by: NonRenewalBy.SCHOOL, note })
            : values.choice === 'NOTICE'
              ? NOT_RENEW_CONTRACT(id, { by: NonRenewalBy.EMPLOYEE, receivedOn: values.date ?? undefined, note, fileUrl: file?.fileUrl ?? null })
              : REQUEST_EARLY_TERMINATION(id, { requestedOn: values.date ?? '', note, fileUrl: file?.fileUrl ?? null });
      const res = await callApi(request as Promise<Awaited<ReturnType<typeof NOT_RENEW_CONTRACT>>>, {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: values.choice === 'RENEW' ? t('contracts.renew.done') : t('contracts.decide.saved'),
      });
      if (res.unauthorized) return;
      if (res.success) {
        onDone();
        return;
      }
      setError(contractError(res, { t, has, locale }, t('errors.INTERNAL_ERROR')));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const choiceError = form.formState.errors.choice?.message;

  return (
    <>
      {bottom ? <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" /> : null}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <PersonAvatar photoUrl={contract.employee.photoUrl} gender={contract.employee.gender} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <SheetTitle className="font-display text-base font-extrabold break-words">{name}</SheetTitle>
          <span className="text-xs text-muted-foreground">
            <bdi dir="ltr" className="tabular">
              {contract.employee.code}
            </bdi>
            {' · '}
            {localName(contract.employee.jobTitle, locale)}
          </span>
        </div>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" aria-label={t('ui.dialog.close')} className="-me-2 cursor-pointer" disabled={busy}>
            <CloseIcon className="size-5" />
          </Button>
        </SheetClose>
      </div>
      <div className="scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <Form id={formId} onSubmit={(e) => void form.handleSubmit(save)(e)} className="gap-4">
          <div className="flex flex-col gap-2">
            <span id={groupId} className="text-sm font-bold">
              {t('contracts.decide.choices')}
            </span>
            <div role="radiogroup" aria-labelledby={groupId} aria-required="true" className="flex flex-col gap-2">
              {choices.map((c) => {
                const Icon = CHOICE_ICON[c];
                const on = choice === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => form.setValue('choice', c, { shouldValidate: form.formState.isSubmitted })}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-semibold transition-colors duration-150',
                      'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55 disabled:cursor-not-allowed',
                      on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card hover:bg-muted',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full border-2',
                        on ? 'border-primary' : 'border-input',
                      )}
                    >
                      {on ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                    </span>
                    <Icon className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">{t(`contracts.decide.${c}`)}</span>
                  </button>
                );
              })}
            </div>
            {choiceError ? <p className="text-xs font-semibold text-destructive-ink">{t(choiceError)}</p> : null}
          </div>

          {choice === 'RENEW' ? (
            <Hint icon={InfoIcon}>
              {t('contracts.decide.renewHint', { start: formatDate(next.startsOn, locale), end: formatDate(next.endsOn, locale) })}
            </Hint>
          ) : null}
          {choice === 'NOT_RENEWING' ? (
            <Hint icon={InfoIcon}>{t('contracts.decide.notRenewingHint', { date: formatDate(contract.endsOn, locale) })}</Hint>
          ) : null}

          {dated ? (
            <>
              <DateField
                control={form.control}
                name="date"
                label={choice === 'NOTICE' ? t('contracts.decide.receivedOn') : t('contracts.decide.requestedOn')}
                placeholder={t('contracts.decide.datePlaceholder')}
                max={todayIso()}
                required
                disabled={busy}
              />
              {timing ? (
                <Hint icon={timing.timing === 'ON_TIME' ? InfoIcon : WarningIcon} tone={timing.timing === 'ON_TIME' ? 'info' : 'warning'} testId="decision-timing">
                  {timing.text}
                </Hint>
              ) : null}
              <ContractFileField
                contractId={contract.id}
                label={choice === 'NOTICE' ? t('contracts.decide.letter') : t('contracts.end.attachment')}
                attachment={choice !== 'NOTICE'}
                value={file}
                onChange={setFile}
                onBusyChange={setUploading}
                disabled={busy}
              />
            </>
          ) : null}

          {choice && choice !== 'RENEW' ? (
            <TextareaField
              control={form.control}
              name="note"
              label={t('contracts.decide.note')}
              placeholder={t('contracts.decide.notePlaceholder')}
              rows={3}
              maxLength={NOTE_MAX}
              disabled={busy}
            />
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm font-semibold text-destructive-ink">
              {error}
            </p>
          ) : null}
        </Form>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <SheetClose asChild>
          <Button variant="secondary" className="cursor-pointer" disabled={busy}>
            {t('contracts.decide.cancel')}
          </Button>
        </SheetClose>
        <Button type="submit" form={formId} variant="primary" className="cursor-pointer" loading={busy} disabled={uploading}>
          {t('contracts.decide.save')}
        </Button>
      </div>
    </>
  );
}

function Hint({
  icon: Icon,
  tone = 'info',
  testId,
  children,
}: {
  icon: AppIcon;
  tone?: 'info' | 'warning';
  testId?: string;
  children: string;
}) {
  return (
    <p
      data-testid={testId}
      aria-live="polite"
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm',
        tone === 'warning' ? 'bg-warning-soft text-warning-ink' : 'bg-info-soft text-info-ink',
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
