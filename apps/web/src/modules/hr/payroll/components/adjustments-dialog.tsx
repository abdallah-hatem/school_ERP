'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADJUSTMENT_TYPES,
  AdjustmentType,
  type Month,
  type PayrollAdjustment,
  type PayrollRun,
  type Uuid,
} from '@school-erp/shared';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { callApi } from '@/lib/callApi';
import { MoneyField, SelectField, TextareaField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { Money } from '@/shared/components/ui/figures';
import { AddIcon, RemoveIcon } from '@/shared/components/ui/icons';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatMoney, formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { ADD_PAYROLL_ADJUSTMENT, REMOVE_PAYROLL_ADJUSTMENT } from '../apis';
import {
  ADJUSTMENT_REASON_MAX,
  adjustmentFormSchema,
  EMPTY_ADJUSTMENT,
  toAdjustmentRequest,
  type AdjustmentFormValues,
} from '../lib/adjustment-form';

export interface AdjustmentsTarget {
  employeeId: Uuid;
  /** The employee's name in the screen's language. */
  name: string;
}

/**
 * One employee's one-off additions and deductions for the run's month. On a draft: add (type,
 * amount, reason — all required) and remove; the run comes back recalculated. On an approved run
 * the list is read-only.
 */
export function AdjustmentsDialog({
  runId,
  month,
  editable,
  target,
  adjustments,
  onOpenChange,
  onRunChange,
}: {
  runId: Uuid;
  month: Month;
  editable: boolean;
  /** `null` = closed. */
  target: AdjustmentsTarget | null;
  /** The employee's adjustments. */
  adjustments: PayrollAdjustment[];
  onOpenChange: (open: boolean) => void;
  /** The run the write returned, with its server stamp (`asOf`). */
  onRunChange: (run: PayrollRun, asOf: number) => void;
}) {
  const { t, locale } = useTranslation();
  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: EMPTY_ADJUSTMENT,
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [removing, setRemoving] = useState<Uuid | null>(null);
  const busy = saving || removing !== null;

  function change(open: boolean) {
    if (busy) return;
    if (!open) form.reset(EMPTY_ADJUSTMENT);
    onOpenChange(open);
  }

  async function add(values: AdjustmentFormValues) {
    if (!target || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await callApi(ADD_PAYROLL_ADJUSTMENT(runId, toAdjustmentRequest(target.employeeId, values)), {
        showSuccessToast: true,
        successMessage: t('payroll.adjustments.added'),
      });
      if (res.unauthorized) return;
      if (res.success && res.data) {
        onRunChange(res.data, res.asOf);
        form.reset(EMPTY_ADJUSTMENT);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function remove(adjustmentId: Uuid) {
    if (removing) return;
    setRemoving(adjustmentId);
    try {
      const res = await callApi(REMOVE_PAYROLL_ADJUSTMENT(runId, adjustmentId), {
        showSuccessToast: true,
        successMessage: t('payroll.adjustments.removed'),
      });
      if (res.unauthorized) return;
      if (res.success && res.data) onRunChange(res.data, res.asOf);
    } finally {
      setRemoving(null);
    }
  }

  const typeLabel = (type: AdjustmentType) => t(`common.enums.adjustmentType.${type}`);

  return (
    <Dialog open={target !== null} onOpenChange={change}>
      <DialogContent
        size="md"
        title={t('payroll.adjustments.title', { name: target?.name ?? '' })}
        description={t('payroll.adjustments.description', {
          month: formatMonth(month, locale),
        })}
        closeLabel={t('payroll.adjustments.close')}
        footer={
          editable ? (
            <>
              <DialogClose asChild>
                <Button variant="secondary" disabled={busy}>
                  {t('payroll.adjustments.close')}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                form="adjustment-form"
                variant="primary"
                loading={saving}
                disabled={removing !== null}
              >
                {saving ? null : <AddIcon />}
                {t('payroll.adjustments.add')}
              </Button>
            </>
          ) : (
            <DialogClose asChild>
              <Button variant="secondary">{t('payroll.adjustments.close')}</Button>
            </DialogClose>
          )
        }
      >
        <div className="flex flex-col gap-5">
          <section aria-label={t('payroll.adjustments.listLabel')} className="flex flex-col gap-2">
            {adjustments.length === 0 ? (
              <p className="bg-muted text-muted-foreground rounded-xl px-3.5 py-3 text-sm">
                {t('payroll.adjustments.none')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {adjustments.map((a) => (
                  <li key={a.id} className="border-border flex items-start gap-3 rounded-xl border px-3.5 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={a.type === AdjustmentType.ADDITION ? 'success' : 'danger'}>
                          {typeLabel(a.type)}
                        </StatusPill>
                        <Money value={a.amount} className="font-bold" />
                      </div>
                      <p className="text-muted-foreground text-sm break-words">
                        <BidiText>{a.reason}</BidiText>
                      </p>
                    </div>
                    {editable ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer"
                        aria-label={t('payroll.adjustments.removeLabel', {
                          type: typeLabel(a.type),
                          amount: formatMoney(a.amount),
                        })}
                        loading={removing === a.id}
                        disabled={busy && removing !== a.id}
                        onClick={() => void remove(a.id)}
                      >
                        {removing === a.id ? null : <RemoveIcon className="size-5" />}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {editable ? (
            <Form
              id="adjustment-form"
              onSubmit={(e) => void form.handleSubmit(add)(e)}
              className="border-border border-t pt-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  control={form.control}
                  name="type"
                  required
                  label={t('payroll.adjustments.type')}
                  options={ADJUSTMENT_TYPES.map((type) => ({
                    value: type,
                    label: typeLabel(type),
                  }))}
                  disabled={saving}
                />
                <MoneyField
                  control={form.control}
                  name="amount"
                  required
                  label={t('payroll.adjustments.amount')}
                  placeholder={t('payroll.adjustments.amountPlaceholder')}
                  disabled={saving}
                />
              </div>
              <TextareaField
                control={form.control}
                name="reason"
                required
                rows={3}
                maxLength={ADJUSTMENT_REASON_MAX}
                label={t('payroll.adjustments.reason')}
                placeholder={t('payroll.adjustments.reasonPlaceholder')}
                disabled={saving}
              />
            </Form>
          ) : (
            <p className="text-muted-foreground text-sm">{t('payroll.adjustments.readOnly')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
