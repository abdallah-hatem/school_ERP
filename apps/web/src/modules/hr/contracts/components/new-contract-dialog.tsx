'use client';

import { defaultNewContractStart, oneYearContractEnd, type IsoDate } from '@school-erp/shared';
import { useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { callApi } from '@/lib/callApi';
import { DateField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { InfoIcon } from '@/shared/components/ui/icons';
import { formatDate } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_EMPLOYEE_CONTRACT } from '../apis';
import { contractError } from '../lib/contract-text';
import { SignedCopyField, uploadPickedPages } from './signed-copy';

/**
 * A new contract for an active employee with no active one (review 2026-11-24: a reactivated
 * employee, or after the school's not-renewing ended): an optional start (default 1 June of the
 * current contract year, the API's default too) and it runs one year. The API refuses an overlap.
 */
export function NewContractDialog({
  employeeId,
  name,
  today,
  open,
  onOpenChange,
  onDone,
}: {
  employeeId: string;
  /** The employee's name in the screen's language. */
  name: string;
  today: IsoDate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t, has, locale } = useTranslation();
  const formId = useId();
  const fallback = defaultNewContractStart(today);
  const form = useForm<{ startsOn: string | null }>({ defaultValues: { startsOn: null } });
  const startsOn = useWatch({ control: form.control, name: 'startsOn' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The new contract's signed copy, optional (owner, 2026-11-24): uploaded once the contract exists.
  const [pages, setPages] = useState<File[]>([]);
  const inFlight = useRef(false);

  function change(next: boolean) {
    if (busy) return;
    if (!next) {
      form.reset({ startsOn: null });
      setError(null);
      setPages([]);
    }
    onOpenChange(next);
  }

  async function save(values: { startsOn: string | null }) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await callApi(CREATE_EMPLOYEE_CONTRACT(employeeId, values.startsOn ? { startsOn: values.startsOn } : {}), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('contracts.newContract.done'),
      });
      if (res.unauthorized) return;
      if (res.success) {
        if (res.data?.id && pages.length > 0) await uploadPickedPages(res.data.id, pages, t);
        form.reset({ startsOn: null });
        setPages([]);
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
        size="sm"
        title={t('contracts.newContract.title')}
        description={t('contracts.newContract.description', { name })}
        closeLabel={t('ui.dialog.close')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" className="cursor-pointer" disabled={busy}>
                {t('ui.dialog.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" form={formId} variant="primary" className="cursor-pointer" loading={busy}>
              {t('contracts.newContract.confirm')}
            </Button>
          </>
        }
      >
        <Form id={formId} onSubmit={(e) => void form.handleSubmit(save)(e)}>
          <DateField
            control={form.control}
            name="startsOn"
            label={t('contracts.newContract.startsOn')}
            hint={t('contracts.newContract.startsOnHint', { date: formatDate(fallback, locale) })}
            placeholder={formatDate(fallback, locale)}
            clearable
            disabled={busy}
          />
          <p data-testid="new-contract-end" className="flex items-start gap-2.5 rounded-xl bg-info-soft px-3.5 py-3 text-sm text-info-ink">
            <InfoIcon className="mt-0.5 size-5 shrink-0" />
            <span>{t('contracts.newContract.ends', { date: formatDate(oneYearContractEnd(startsOn || fallback), locale) })}</span>
          </p>
          <SignedCopyField files={pages} onChange={setPages} disabled={busy} />
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
