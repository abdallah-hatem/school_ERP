'use client';

import { PenaltyStatus, type PenaltyRecord } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { RowActions } from '@/shared/components/data-table/row-actions';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { ApproveIcon, CloseIcon } from '@/shared/components/ui/icons';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { APPROVE_PENALTY, CANCEL_PENALTY } from '../apis';
import { describeAction, errorMessage } from '../lib/penalty-text';

type Pending = 'approve' | 'cancel' | null;

/**
 * A row's ⋯ menu: approve (pending only) behind a confirmation, cancel (pending or approved) with
 * a required reason. A cancelled penalty has none (§4). When the server refuses — the month's
 * payroll is approved, it was cancelled meanwhile — the dialog stays open with the translated
 * reason and the list refreshes to show the record as it now is. Each action shows only to a user
 * holding its permission (view only — the API refuses the rest); with neither, no menu.
 */
export function PenaltyActions({ record }: { record: PenaltyRecord }) {
  const { t, has, locale } = useTranslation();
  const can = useCan();
  const router = useRouter();
  const [open, setOpen] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  // A refused request means the record changed on the server; refresh once the dialog closes so
  // the explanation stays readable (a refresh to "cancelled" would remove these actions mid-read).
  const stale = useRef(false);

  const canApprove = can('hr.penalties.approve') && record.status === PenaltyStatus.PENDING;
  const canCancel = can('hr.penalties.cancel');
  if (record.status === PenaltyStatus.CANCELLED || (!canApprove && !canCancel)) return null;

  const name = nameIn(record.employee, locale);
  const violation = nameIn(record.violation, locale);
  const action = describeAction(t, locale, record.action, record.days);

  function show(next: Pending) {
    setError(null);
    setOpen(next);
  }

  function close() {
    setOpen(null);
    if (stale.current) {
      stale.current = false;
      router.refresh();
    }
  }

  async function run(request: Promise<Awaited<ReturnType<typeof APPROVE_PENALTY>>>, successMessage: string) {
    setError(null);
    const res = await callApi(request, { showErrorToast: false, showSuccessToast: true, successMessage });
    if (res.unauthorized) return false;
    if (res.success) {
      router.refresh();
      return true;
    }
    stale.current = true;
    setError(errorMessage(res, t, has, t('errors.INTERNAL_ERROR')));
    return false;
  }

  const alert = error ? (
    <span role="alert" className="mt-3 block rounded-xl bg-destructive-soft px-3.5 py-2.5 font-semibold text-destructive-ink">
      {error}
    </span>
  ) : null;

  return (
    <>
      <RowActions
        label={t('ui.table.actionsFor', { name: `${name} · ${violation}` })}
        actions={[
          {
            id: 'approve',
            label: t('penalties.approve.button'),
            icon: ApproveIcon,
            hidden: !canApprove,
            onSelect: () => show('approve'),
          },
          {
            id: 'cancel',
            label: t('penalties.cancel.button'),
            icon: CloseIcon,
            destructive: true,
            hidden: !canCancel,
            onSelect: () => show('cancel'),
          },
        ]}
      />
      <ConfirmDialog
        open={open === 'approve'}
        onOpenChange={(next) => (next ? show('approve') : close())}
        title={t('penalties.approve.title')}
        description={
          <>
            {t('penalties.approve.body', { name, violation, action })}
            {alert}
          </>
        }
        confirmLabel={t('penalties.approve.confirm')}
        onConfirm={() => run(APPROVE_PENALTY(record.id), t('penalties.approve.done'))}
      />
      <ConfirmDialog
        open={open === 'cancel'}
        onOpenChange={(next) => (next ? show('cancel') : close())}
        tone="destructive"
        title={t('penalties.cancel.title')}
        description={
          <>
            {t('penalties.cancel.body', { name, violation })}
            {alert}
          </>
        }
        confirmLabel={t('penalties.cancel.confirm')}
        requireReason
        reasonLabel={t('penalties.cancel.reasonLabel')}
        reasonPlaceholder={t('penalties.cancel.reasonPlaceholder')}
        onConfirm={(reason) => run(CANCEL_PENALTY(record.id, reason ?? ''), t('penalties.cancel.done'))}
      />
    </>
  );
}
