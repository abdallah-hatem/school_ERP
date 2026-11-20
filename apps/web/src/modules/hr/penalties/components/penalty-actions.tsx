'use client';

import {
  PenaltyStatus,
  type PenaltyRecord,
  type PenaltyRecountAcknowledgement,
  type PenaltyRecountChange,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { RowActions } from '@/shared/components/data-table/row-actions';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { ApproveIcon, CloseIcon } from '@/shared/components/ui/icons';
import { formatCount } from '@/shared/lib/format';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { APPROVE_PENALTY, CANCEL_PENALTY } from '../apis';
import { approveBlockedReason, describeAction, errorMessage, recountFromConflict } from '../lib/penalty-text';
import { RecountList } from './recount-list';

type Pending = 'approve' | 'cancel' | null;

/**
 * A row's ⋯ menu: approve (pending only) behind a confirmation, cancel (pending or approved) with
 * a required reason. A cancelled penalty has none (§4). When the server refuses — the month's
 * payroll is approved, it was cancelled meanwhile — the dialog stays open with the translated
 * reason and the list refreshes to show the record as it now is. Each action shows only to a user
 * holding its permission (view only — the API refuses the rest); with neither, no menu.
 * `variant="buttons"`: the same actions as buttons (the penalty a notification opens).
 * §4 approve in date order: while an earlier penalty of the same violation is still pending
 * (`record.earlierPending`), Approve is shown disabled with the reason (the menu item says it under
 * its label; the button is described by `approveBlockedReason`'s sentence shown with it). Cancel
 * stays available. Should the list be out of date, the server's refusal says the same in the dialog.
 * §4 backdated penalty (owner 2026-11-20): when approving moves approved penalties up
 * (`record.recount`), the confirmation lists them and its button says so ("Approve and update 2
 * penalties"); the request confirms exactly that list, and a 409 with a fresh one replaces it in
 * the open dialog to confirm again. One in an approved payroll month (`recountLockedMonth`)
 * disables Approve with the reason, like an earlier pending one.
 */
export function PenaltyActions({ record, variant = 'menu' }: { record: PenaltyRecord; variant?: 'menu' | 'buttons' }) {
  const { t, has, locale } = useTranslation();
  const can = useCan();
  const router = useRouter();
  const [open, setOpen] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  // §4 backdated: what approving moves up, as the dialog shows it — the server's fresh list after
  // a 409 (`PENALTY_RECOUNT_CHANGED`), until the dialog is opened again.
  const [recount, setRecount] = useState<PenaltyRecountChange[]>(record.recount);
  // A refused request means the record changed on the server; refresh once the dialog closes so
  // the explanation stays readable (a refresh to "cancelled" would remove these actions mid-read).
  const stale = useRef(false);

  const canApprove = can('hr.penalties.approve') && record.status === PenaltyStatus.PENDING;
  const blockedReason = canApprove ? approveBlockedReason(record, t, locale) : null;
  const canCancel = can('hr.penalties.cancel');
  if (record.status === PenaltyStatus.CANCELLED || (!canApprove && !canCancel)) return null;

  const name = nameIn(record.employee, locale);
  const violation = nameIn(record.violation, locale);
  const action = describeAction(t, locale, record.action, record.days);

  function show(next: Pending) {
    setError(null);
    if (next === 'approve' && open !== 'approve') setRecount(record.recount);
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
    // The approved penalties it moves up changed meanwhile: show the fresh list to confirm again.
    const fresh = recountFromConflict(res);
    if (fresh) {
      setRecount(fresh);
      setError(t('penalties.approve.recountRefreshed'));
      return false;
    }
    setError(errorMessage(res, t, has, t('errors.INTERNAL_ERROR'), locale));
    return false;
  }

  const acknowledged: PenaltyRecountAcknowledgement[] = recount.map((c) => ({ id: c.id, ...c.after }));

  const alert = error ? (
    <span role="alert" className="mt-3 block rounded-xl bg-destructive-soft px-3.5 py-2.5 font-semibold text-destructive-ink">
      {error}
    </span>
  ) : null;

  const trigger =
    variant === 'buttons' ? (
      <>
        {canCancel ? (
          <Button variant="secondary" className="cursor-pointer text-destructive-ink" onClick={() => show('cancel')}>
            <CloseIcon />
            {t('penalties.cancel.button')}
          </Button>
        ) : null}
        {canApprove ? (
          <Button
            variant="primary"
            className="cursor-pointer disabled:cursor-not-allowed"
            disabled={!!blockedReason}
            aria-describedby={blockedReason ? `penalty-${record.id}-blocked` : undefined}
            onClick={() => show('approve')}
          >
            <ApproveIcon />
            {t('penalties.approve.button')}
          </Button>
        ) : null}
      </>
    ) : (
      <RowActions
        label={t('ui.table.actionsFor', { name: `${name} · ${violation}` })}
        actions={[
          {
            id: 'approve',
            label: t('penalties.approve.button'),
            icon: ApproveIcon,
            hidden: !canApprove,
            disabledReason: blockedReason ?? undefined,
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
    );

  return (
    <>
      {trigger}
      <ConfirmDialog
        open={open === 'approve'}
        onOpenChange={(next) => (next ? show('approve') : close())}
        title={t('penalties.approve.title')}
        description={
          <>
            {t('penalties.approve.body', { name, violation, action })}
            <RecountList recount={recount} note={t('penalties.recount.approveNote')} className="mt-3" />
            {alert}
          </>
        }
        confirmLabel={
          recount.length > 0
            ? t('penalties.approve.confirmRecount', { count: formatCount(recount.length) })
            : t('penalties.approve.confirm')
        }
        onConfirm={() =>
          run(
            // Confirms exactly what the dialog lists (§4): the server refuses anything else.
            acknowledged.length > 0 ? APPROVE_PENALTY(record.id, acknowledged) : APPROVE_PENALTY(record.id),
            t('penalties.approve.done'),
          )
        }
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
