'use client';

import { renewedContractDates, type Contract, type SchoolCalendarDates } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { RowActions, type RowAction } from '@/shared/components/data-table/row-actions';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import {
  ApproveIcon,
  BlockedIcon,
  CloseIcon,
  DeactivateIcon,
  EmailIcon,
  HistoryIcon,
  LockedIcon,
  OpenIcon,
  PendingIcon,
  RecalculateIcon,
  RestoreIcon,
} from '@/shared/components/ui/icons';
import { formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  APPROVE_EARLY_TERMINATION,
  DEACTIVATE_CONTRACTS,
  REJECT_EARLY_TERMINATION,
  RENEW_CONTRACTS,
  WITHDRAW_NOTICE,
} from '../apis';
import { abilitiesOf, contractError, nextAction } from '../lib/contract-text';
import type { DecisionChoice } from '../lib/decision-form';
import { DecisionSheet } from './decision-sheet';
import { EndContractDialog } from './end-contract-dialog';

type Confirm = 'renew' | 'approve' | 'reject' | 'withdraw' | 'deactivate' | null;

/**
 * One contract's actions (spec → Screens; mockup option A): the one next step as a button — Renew,
 * Approve + Reject a waiting early termination, Deactivate an ended one, or open the notice letter —
 * then a ⋯ menu with the other decisions (not renewing, the employee's notice, an early termination
 * request, withdrawing a notice), the employee's contract history and "End for another reason…".
 * Below the table width a "Decide" button opens the same decision sheet as a bottom sheet.
 * Only for `hr.contracts.manage` (deactivating: `hr.employees.change_status`); nobody acts on their
 * own contract — the row says why instead. View only: the API decides every write.
 */
export function ContractActions({
  contract,
  today,
  calendar,
  historyHref,
  decideBelow = 'cards',
}: {
  contract: Contract;
  /** The school's today (`YYYY-MM-DD`, Cairo). */
  today: string;
  /** The contract year's calendar when the screen has it; undefined: the sheet asks. */
  calendar?: SchoolCalendarDates | null;
  /** The employee's Contracts tab; left out on the tab itself. */
  historyHref?: string;
  /**
   * Where "Decide" shows: only on the table's phone cards (`cards`: hidden from the table's width),
   * or `always` (the employee's tab, where there is one current contract).
   */
  decideBelow?: 'cards' | 'always';
}) {
  const { t, has, locale } = useTranslation();
  const can = useCan();
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [sheet, setSheet] = useState<{ choice?: DecisionChoice } | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stale = useRef(false);

  const abilities = abilitiesOf(contract, {
    manage: can('hr.contracts.manage'),
    changeStatus: can('hr.employees.change_status'),
    today,
  });
  const next = nextAction(contract, abilities);
  const name = localName(contract.employee, locale);
  const choices: DecisionChoice[] = [
    ...(abilities.renew ? (['RENEW'] as const) : []),
    ...(abilities.decide ? (['NOT_RENEWING', 'NOTICE', 'EARLY_TERMINATION'] as const) : []),
  ];
  const letter = contract.notice?.fileUrl ?? null;

  function open(next: Confirm) {
    setError(null);
    setConfirm(next);
  }

  function close() {
    setConfirm(null);
    if (stale.current) {
      stale.current = false;
      router.refresh();
    }
  }

  /** Runs a write; a refusal keeps the dialog open with its reason, and the list refreshes on close. */
  async function run(request: Promise<{ success?: boolean; unauthorized?: boolean } & Record<string, unknown>>, done: string) {
    setError(null);
    const res = await callApi(request as Promise<Awaited<ReturnType<typeof WITHDRAW_NOTICE>>>, {
      showErrorToast: false,
      showSuccessToast: true,
      successMessage: done,
    });
    if (res.unauthorized) return false;
    if (res.success) {
      router.refresh();
      return true;
    }
    stale.current = true;
    setError(contractError(res, { t, has, locale }, t('errors.INTERNAL_ERROR')));
    return false;
  }

  const alert = error ? (
    <span role="alert" className="mt-3 block rounded-xl bg-destructive-soft px-3.5 py-2.5 font-semibold text-destructive-ink">
      {error}
    </span>
  ) : null;

  const menu: RowAction[] = [
    { id: 'notRenewing', label: t('contracts.actions.notRenewing'), icon: BlockedIcon, hidden: !abilities.decide, onSelect: () => setSheet({ choice: 'NOT_RENEWING' }) },
    { id: 'notice', label: t('contracts.actions.notice'), icon: EmailIcon, hidden: !abilities.decide, onSelect: () => setSheet({ choice: 'NOTICE' }) },
    {
      id: 'earlyTermination',
      label: t('contracts.actions.earlyTermination'),
      icon: PendingIcon,
      hidden: !abilities.decide,
      onSelect: () => setSheet({ choice: 'EARLY_TERMINATION' }),
    },
    { id: 'withdrawNotice', label: t('contracts.actions.withdrawNotice'), icon: RestoreIcon, hidden: !abilities.withdrawNotice, onSelect: () => open('withdraw') },
    { id: 'history', label: t('contracts.actions.history'), icon: HistoryIcon, hidden: !historyHref, href: historyHref },
    { id: 'end', label: t('contracts.actions.end'), icon: CloseIcon, destructive: true, hidden: !abilities.end, onSelect: () => setEnding(true) },
  ];

  let primary: ReactNode = null;
  if (next === 'renew') {
    primary = (
      <Button size="sm" variant="soft" className="cursor-pointer" onClick={() => open('renew')}>
        <RecalculateIcon />
        {t('contracts.actions.renew')}
      </Button>
    );
  } else if (next === 'decideEarly') {
    primary = (
      <>
        <Button size="sm" variant="success-soft" className="cursor-pointer" onClick={() => open('approve')}>
          <ApproveIcon />
          {t('contracts.actions.approve')}
        </Button>
        <Button size="sm" variant="destructive-outline" className="cursor-pointer" onClick={() => open('reject')}>
          <CloseIcon />
          {t('contracts.actions.reject')}
        </Button>
      </>
    );
  } else if (next === 'deactivate') {
    primary = (
      <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => open('deactivate')}>
        <DeactivateIcon />
        {t('contracts.actions.deactivate')}
      </Button>
    );
  } else if (letter) {
    primary = (
      <Button asChild size="sm" variant="secondary" className="cursor-pointer">
        <a href={letter} target="_blank" rel="noreferrer">
          <OpenIcon />
          {t('contracts.actions.letter')}
        </a>
      </Button>
    );
  }

  const decide =
    choices.length > 0 ? (
      <Button
        size="sm"
        variant="secondary"
        // On the table's own width the ⋯ holds the decisions; the phone card gets a button.
        className={cn('cursor-pointer', decideBelow === 'cards' && '@min-[1100px]:hidden')}
        onClick={() => setSheet({})}
      >
        {t('contracts.actions.decide')}
      </Button>
    ) : null;

  const renewed = renewedContractDates(contract.endsOn);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {abilities.own ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="own-contract">
          <LockedIcon className="size-4 shrink-0" />
          {t('contracts.actions.ownContract')}
        </span>
      ) : null}
      {primary}
      {decide}
      <RowActions label={t('contracts.actions.menu', { name })} actions={menu} />

      <ConfirmDialog
        open={confirm === 'renew'}
        onOpenChange={(o) => (o ? open('renew') : close())}
        title={t('contracts.renew.title')}
        description={
          <>
            {t('contracts.renew.body', { name, start: formatDate(renewed.startsOn, locale), end: formatDate(renewed.endsOn, locale) })}
            {alert}
          </>
        }
        confirmLabel={t('contracts.renew.confirm')}
        onConfirm={() => run(RENEW_CONTRACTS([contract.id]), t('contracts.renew.done'))}
      />
      <ConfirmDialog
        open={confirm === 'approve'}
        onOpenChange={(o) => (o ? open('approve') : close())}
        title={t('contracts.approve.title')}
        description={
          <>
            {contract.earlyTermination?.wouldEndOn
              ? t('contracts.approve.body', { name, date: formatDate(contract.earlyTermination.wouldEndOn, locale) })
              : t('contracts.approve.bodyNoDate', { name })}
            {alert}
          </>
        }
        confirmLabel={t('contracts.approve.confirm')}
        onConfirm={() => run(APPROVE_EARLY_TERMINATION(contract.id), t('contracts.approve.done'))}
      />
      <ConfirmDialog
        open={confirm === 'reject'}
        onOpenChange={(o) => (o ? open('reject') : close())}
        tone="destructive"
        title={t('contracts.reject.title')}
        description={
          <>
            {t('contracts.reject.body', { name })}
            {alert}
          </>
        }
        confirmLabel={t('contracts.reject.confirm')}
        requireReason
        reasonLabel={t('contracts.reject.reasonLabel')}
        reasonPlaceholder={t('contracts.reject.reasonPlaceholder')}
        onConfirm={(reason) => run(REJECT_EARLY_TERMINATION(contract.id, reason ?? ''), t('contracts.reject.done'))}
      />
      <ConfirmDialog
        open={confirm === 'withdraw'}
        onOpenChange={(o) => (o ? open('withdraw') : close())}
        title={t('contracts.withdraw.title')}
        description={
          <>
            {t('contracts.withdraw.body', { name })}
            {alert}
          </>
        }
        confirmLabel={t('contracts.withdraw.confirm')}
        requireReason
        reasonLabel={t('contracts.withdraw.reasonLabel')}
        reasonPlaceholder={t('contracts.withdraw.reasonPlaceholder')}
        onConfirm={(reason) => run(WITHDRAW_NOTICE(contract.id, reason ?? ''), t('contracts.withdraw.done'))}
      />
      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(o) => (o ? open('deactivate') : close())}
        tone="destructive"
        title={t('contracts.deactivate.title', { name })}
        description={
          <>
            {t('contracts.deactivate.body')}
            {alert}
          </>
        }
        confirmLabel={t('contracts.deactivate.confirm')}
        onConfirm={() => run(DEACTIVATE_CONTRACTS([contract.id]), t('contracts.deactivate.done'))}
      />
      {abilities.end ? (
        <EndContractDialog contract={contract} today={today} open={ending} onOpenChange={setEnding} onDone={() => router.refresh()} />
      ) : null}
      {choices.length > 0 ? (
        <DecisionSheet
          contract={sheet ? contract : null}
          choice={sheet?.choice}
          choices={choices}
          calendar={calendar}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
