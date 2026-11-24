'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CONTRACT_END_REASONS, type Contract, type ContractEndRequestReason } from '@school-erp/shared';
import { useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { callApi } from '@/lib/callApi';
import { DateField, SelectField, TextareaField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { END_CONTRACT } from '../apis';
import { contractError } from '../lib/contract-text';
import { endSchema, NOTE_MAX, type EndValues } from '../lib/decision-form';
import { ContractFileField, type UploadedFile } from './contract-file-field';

/**
 * Ending a contract for another reason (spec → What it adds, 5): the reason, the last day (today or
 * later, within the contract — the API also refuses a day before an approved payroll month's end),
 * a note and an optional attachment. A refusal stays in the dialog with its reason.
 */
export function EndContractDialog({
  contract,
  today,
  open,
  onOpenChange,
  onDone,
}: {
  contract: Contract;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t, has, locale } = useTranslation();
  const formId = useId();
  const empty: EndValues = { reason: '', endsOn: today, note: '' };
  const form = useForm<EndValues>({ resolver: zodResolver(endSchema), defaultValues: empty });
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const name = localName(contract.employee, locale);
  const min = today > contract.startsOn ? today : contract.startsOn;

  function change(next: boolean) {
    if (busy) return;
    if (!next) {
      form.reset(empty);
      setFile(null);
      setError(null);
    }
    onOpenChange(next);
  }

  async function save(values: EndValues) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await callApi(
        END_CONTRACT(contract.id, {
          reason: values.reason as ContractEndRequestReason,
          endsOn: values.endsOn ?? today,
          note: values.note.trim(),
          fileUrl: file?.fileUrl ?? null,
        }),
        { showErrorToast: false, showSuccessToast: true, successMessage: t('contracts.end.done') },
      );
      if (res.unauthorized) return;
      if (res.success) {
        form.reset(empty);
        setFile(null);
        onOpenChange(false);
        onDone();
        return;
      }
      setError(contractError(res, { t, has, locale }, t('errors.INTERNAL_ERROR')));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        size="md"
        title={t('contracts.end.title')}
        description={t('contracts.end.description', {
          name,
          start: formatDate(contract.startsOn, locale),
          end: formatDate(contract.endsOn, locale),
        })}
        closeLabel={t('ui.dialog.close')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" className="cursor-pointer" disabled={busy}>
                {t('ui.dialog.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" form={formId} variant="destructive" className="cursor-pointer" loading={busy} disabled={uploading}>
              {t('contracts.end.confirm')}
            </Button>
          </>
        }
      >
        <Form id={formId} onSubmit={(e) => void form.handleSubmit(save)(e)}>
          <SelectField
            control={form.control}
            name="reason"
            label={t('contracts.end.reason')}
            placeholder={t('contracts.end.reasonPlaceholder')}
            options={CONTRACT_END_REASONS.map((r) => ({ value: r, label: t(`common.enums.contractEndReason.${r}`) }))}
            required
            disabled={busy}
          />
          <DateField
            control={form.control}
            name="endsOn"
            label={t('contracts.end.endsOn')}
            hint={t('contracts.end.endsOnHint')}
            placeholder={t('contracts.decide.datePlaceholder')}
            min={min}
            max={contract.endsOn}
            required
            disabled={busy}
          />
          <TextareaField
            control={form.control}
            name="note"
            label={t('contracts.end.note')}
            placeholder={t('contracts.end.notePlaceholder')}
            rows={3}
            maxLength={NOTE_MAX}
            required
            disabled={busy}
          />
          <ContractFileField
            contractId={contract.id}
            label={t('contracts.end.attachment')}
            attachment
            value={file}
            onChange={setFile}
            onBusyChange={setUploading}
            disabled={busy}
          />
          {error ? (
            <p role="alert" className="rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm font-semibold text-destructive-ink">
              {error}
            </p>
          ) : null}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
