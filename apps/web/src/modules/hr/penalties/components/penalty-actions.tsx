'use client';

import {
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
import { ApproveIcon, BlockedIcon, CloseIcon } from '@/shared/components/ui/icons';
import { formatCount } from '@/shared/lib/format';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { APPROVE_PENALTY, CANCEL_PENALTY, REJECT_PENALTY, REVIEW_APPROVE_PENALTY } from '../apis';
import { approveBlockedReason, describeAction, errorMessage, penaltySteps, recountFromConflict } from '../lib/penalty-text';
import { RecountList } from './recount-list';

type Pending = 'review' | 'approve' | 'reject' | 'cancel' | null;

/**
 * A penalty's actions (§4 two steps, owner 2026-11-21), each only for whoever may take it (view
 * only — the API decides):
 * - **Pending stage review**: the stage head approves (optional note → Waiting for HR) or rejects
 *   (required reason). With no stage head left (`hrMayDecide`), HR's approve / reject show instead.
 * - **Waiting for HR**: HR approves (optional note; fixes the level and deduction) or rejects.
 * - **Cancel** (with a reason) while waiting at either step or approved, as before.
 * Nobody gets review / HR actions on their own penalty (`ownPenalty`). A rejected or cancelled
 * penalty has none. When the server refuses — someone acted first (409 `PENALTY_WRONG_STEP`), the
 * month's payroll is approved — the dialog stays open with the reason, and the list refreshes when
 * it closes. `variant="buttons"`: the same actions as buttons (the penalty's details dialog).
 * §4 approve in date order and the backdated recount stay on the HR step's Approve.
 */
export function PenaltyActions({ record, variant = 'menu' }: { record: PenaltyRecord; variant?: 'menu' | 'buttons' }) {
  const { t, has, locale } = useTranslation();
  const can = useCan();
  const router = useRouter();
  const [open, setOpen] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [recount, setRecount] = useState<PenaltyRecountChange[]>(record.recount);
  const stale = useRef(false);

  const steps = penaltySteps(record, can);
  const blockedReason = steps.hrApprove ? approveBlockedReason(record, t, locale) : null;
  if (!steps.review && !steps.hrApprove && !steps.cancel) return null;

  const name = nameIn(record.employee, locale);
  const violation = nameIn(record.violation, locale);
  const stage = nameIn(record.stage, locale);
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
  // Reject at the stage review (the stage head), or at HR (also for a review nobody can give).
  const rejectStep: 'review' | 'hr' = steps.review ? 'review' : 'hr';
  const canReject = steps.review || steps.hrApprove;

  const alert = error ? (
    <span role="alert" className="mt-3 block rounded-xl bg-destructive-soft px-3.5 py-2.5 font-semibold text-destructive-ink">
      {error}
    </span>
  ) : null;

  const approveLabel = steps.review ? t('penalties.review.approve.button') : t('penalties.approve.button');
  const onApprove = () => show(steps.review ? 'review' : 'approve');

  const trigger =
    variant === 'buttons' ? (
      <>
        {steps.cancel ? (
          <Button variant="ghost" className="cursor-pointer text-destructive-ink" onClick={() => show('cancel')}>
            <CloseIcon />
            {t('penalties.cancel.button')}
          </Button>
        ) : null}
        {canReject ? (
          <Button variant="secondary" className="cursor-pointer text-destructive-ink" onClick={() => show('reject')}>
            <BlockedIcon />
            {t('penalties.reject.button')}
          </Button>
        ) : null}
        {steps.review || steps.hrApprove ? (
          <Button
            variant="primary"
            className="cursor-pointer disabled:cursor-not-allowed"
            disabled={!steps.review && !!blockedReason}
            aria-describedby={!steps.review && blockedReason ? `penalty-${record.id}-blocked` : undefined}
            onClick={onApprove}
          >
            <ApproveIcon />
            {approveLabel}
          </Button>
        ) : null}
      </>
    ) : (
      <RowActions
        label={t('ui.table.actionsFor', { name: `${name} · ${violation}` })}
        actions={[
          {
            id: 'approve',
            label: approveLabel,
            icon: ApproveIcon,
            hidden: !steps.review && !steps.hrApprove,
            disabledReason: steps.review ? undefined : (blockedReason ?? undefined),
            onSelect: onApprove,
          },
          {
            id: 'reject',
            label: t('penalties.reject.button'),
            icon: BlockedIcon,
            destructive: true,
            hidden: !canReject,
            onSelect: () => show('reject'),
          },
          {
            id: 'cancel',
            label: t('penalties.cancel.button'),
            icon: CloseIcon,
            destructive: true,
            hidden: !steps.cancel,
            onSelect: () => show('cancel'),
          },
        ]}
      />
    );

  return (
    <>
      {trigger}
      <ConfirmDialog
        open={open === 'review'}
        onOpenChange={(next) => (next ? show('review') : close())}
        title={t('penalties.review.approve.title')}
        description={
          <>
            {t('penalties.review.approve.body', { name, violation, stage })}
            {alert}
          </>
        }
        confirmLabel={t('penalties.review.approve.confirm')}
        optionalNote
        reasonLabel={t('penalties.approve.noteLabel')}
        reasonPlaceholder={t('penalties.approve.notePlaceholder')}
        onConfirm={(note) => run(REVIEW_APPROVE_PENALTY(record.id, note), t('penalties.review.approve.done'))}
      />
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
        optionalNote
        reasonLabel={t('penalties.approve.noteLabel')}
        reasonPlaceholder={t('penalties.approve.notePlaceholder')}
        onConfirm={(note) =>
          run(
            // Confirms exactly what the dialog lists (§4): the server refuses anything else.
            APPROVE_PENALTY(record.id, acknowledged.length > 0 ? acknowledged : undefined, note),
            t('penalties.approve.done'),
          )
        }
      />
      <ConfirmDialog
        open={open === 'reject'}
        onOpenChange={(next) => (next ? show('reject') : close())}
        tone="destructive"
        title={t('penalties.reject.title')}
        description={
          <>
            {t('penalties.reject.body', { name, violation })}
            {alert}
          </>
        }
        confirmLabel={t('penalties.reject.confirm')}
        requireReason
        reasonLabel={t('penalties.reject.reasonLabel')}
        reasonPlaceholder={t('penalties.reject.reasonPlaceholder')}
        onConfirm={(reason) => run(REJECT_PENALTY(record.id, reason ?? '', rejectStep), t('penalties.reject.done'))}
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
