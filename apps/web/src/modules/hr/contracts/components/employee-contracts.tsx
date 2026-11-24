'use client';

import {
  CalendarTiming,
  ContractDecision,
  ContractPhase,
  contractYearOf,
  EarlyTerminationStatus,
  formatContractYear,
  PAGINATION,
  ContractStatus,
  EmployeeStatus,
  type Contract,
  type Employee,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { useCan } from '@/core/auth';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActionsSkeleton } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, ContractEndIcon, OpenIcon, RecalculateIcon } from '@/shared/components/ui/icons';
import { Skeleton, SkeletonButton, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { SlotText, TEXT_SLOT } from '@/shared/components/ui/slot-text';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { useProfileEmployeeIfLoaded } from '../../employees';
import { ContractActions } from './contract-actions';
import { ContractDates, ContractDecisionPill, DecisionNote, decisionSubLine } from './contract-bits';
import { ContractCopiesBlock } from './contract-copies';
import { NewContractDialog } from './new-contract-dialog';
import { PrintContractButton } from './print-contract';
import { SignedCopyLink, SignedCopyLinkSkeleton, SignedCopyViewer } from './signed-copy';

export interface EmployeeContractsProps {
  employeeId: string;
  /** The profile's employee (its name and status); null before it loads. */
  employee: Pick<Employee, 'id' | 'nameEn' | 'nameAr' | 'status'> | null;
  /** `/ar/employees/<id>/contracts`. */
  basePath: string;
  /** `undefined` while the first page loads: skeleton rows. */
  rows: Contract[] | undefined;
  total: number;
  page: number;
  limit: number;
  /** The school's today (`YYYY-MM-DD`, Cairo). */
  today: string;
  error?: boolean;
}

/**
 * The employee's Contracts tab (spec → Screens): every contract, newest first, paged by the API —
 * year, dates, the decision, who decided and when, the notice / early termination / end details and
 * the documents — with the decisions on the current contract for whoever may manage contracts (the
 * same actions, dialogs and sheet as the renewals screen).
 */
export function EmployeeContracts({ employeeId, employee, basePath, rows, total, page, limit, today, error = false }: EmployeeContractsProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const can = useCan();
  const [creating, setCreating] = useState(false);
  // Review 2026-11-24: a new contract for an active employee with no active one (reactivated, or
  // after the school's not-renewing ended). The API refuses an overlap or an active one.
  const canCreate =
    can('hr.contracts.manage') &&
    rows !== undefined &&
    employee?.id === employeeId &&
    employee.status === EmployeeStatus.ACTIVE &&
    !rows.some((c) => c.status === ContractStatus.ACTIVE);
  const name = employee ? localName(employee, locale) : '';
  const newContract = canCreate ? (
    <Button variant="primary" className="cursor-pointer" onClick={() => setCreating(true)}>
      <AddIcon />
      {t('contracts.newContract.button')}
    </Button>
  ) : null;
  // Bug 2026-11-24: "Current" is the API's phase — the contract in force today — never the record's
  // dates (a renewal's next contract is "Upcoming" until its first day).
  const isCurrent = (c: Contract) => c.phase === ContractPhase.CURRENT;
  // The actions: on the contract in force (End on a renewed one cancels its next), on an ended one
  // still waiting for HR ("Ended, no decision", "To deactivate"), and on an upcoming one only
  // "Cancel contract" when it isn't a renewal (the abilities decide; a renewal's next has none).
  // Any contract but a cancelled one takes a signed copy (owner, 2026-11-24: old contracts are
  // scanned too), so whoever may manage gets the ⋯ on those rows as well — not on their own.
  const hasActions = (c: Contract) =>
    c.status !== ContractStatus.CANCELLED &&
    (c.phase === ContractPhase.CURRENT ||
      (c.phase === ContractPhase.UPCOMING && c.renewalOf === null) ||
      (c.phase === ContractPhase.PAST && (c.decision === ContractDecision.ENDED_NO_DECISION || c.toDeactivate)) ||
      (can('hr.contracts.manage') && !c.ownContract));

  function goToPage(next: number) {
    const params = new URLSearchParams();
    if (next > 1) params.set('page', String(next));
    if (limit !== PAGINATION.defaultLimit) params.set('limit', String(limit));
    const qs = params.toString();
    startTransition(() => router.push(`${basePath}${qs ? `?${qs}` : ''}`, { scroll: false }));
  }

  const columns: DataTableColumn<Contract>[] = [
    {
      id: 'year',
      header: t('contracts.history.columns.year'),
      // One line: the year and the "Current" pill side by side (the row stays one line tall).
      className: 'w-44 whitespace-nowrap',
      card: 'title',
      skeleton: (
        <span className="flex flex-nowrap items-center gap-2">
          <SkeletonText className="font-bold" width="w-16" />
          <SkeletonPill>{t('contracts.history.current')}</SkeletonPill>
        </span>
      ),
      cell: (c) => (
        <span className="flex flex-nowrap items-center gap-2">
          {/* The contract year it starts in (a 1 Sep 2026 – 31 Aug 2027 contract reads 2026/27, not
              the 2027/28 renewal season it ends in); the dates column has the exact days. */}
          <bdi dir="ltr" className="tabular font-bold">
            {formatContractYear(contractYearOf(c.startsOn))}
          </bdi>
          {isCurrent(c) ? <StatusPill tone="primary">{t('contracts.history.current')}</StatusPill> : null}
          {c.phase === ContractPhase.UPCOMING && c.status !== ContractStatus.CANCELLED ? (
            <StatusPill tone="info">
              {t('contracts.history.upcoming', { date: formatDate(c.startsOn, locale) })}
            </StatusPill>
          ) : null}
        </span>
      ),
    },
    {
      id: 'dates',
      header: t('contracts.history.columns.dates'),
      className: 'w-52 whitespace-nowrap',
      skeleton: <SkeletonText width="w-40" />,
      cell: (c) => <ContractDates contract={c} />,
    },
    {
      id: 'status',
      header: t('contracts.history.columns.status'),
      className: 'w-44 whitespace-normal',
      card: 'status',
      skeleton: <SkeletonPill />,
      cell: (c) => <ContractDecisionPill decision={c.decision} />,
    },
    {
      id: 'details',
      header: t('contracts.history.columns.details'),
      className: 'min-w-56 whitespace-normal',
      card: 'wide',
      skeleton: <SkeletonText className="text-xs" width="w-40" />,
      cell: (c) => <Details contract={c} />,
    },
    {
      id: 'documents',
      header: t('contracts.history.columns.documents'),
      className: 'w-40 whitespace-normal',
      // The usual row: its signed copy's line ("Signed copy (n)" / "No signed copy").
      skeleton: <SignedCopyLinkSkeleton />,
      cell: (c) => <Documents contract={c} />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('contracts.columns.actions')}</span>,
      cardLabel: t('contracts.columns.actions'),
      align: 'end',
      className: 'w-72 whitespace-nowrap',
      card: 'actions',
      // The usual current contract: undecided, so Print contract (contract templates), Renew,
      // Decide and the ⋯ — in their own words.
      skeleton: (
        <span className="flex flex-nowrap items-center justify-end gap-2">
          {can('hr.contracts.manage') ? <Skeleton className="size-9 shrink-0 rounded-lg" /> : null}
          <SkeletonButton size="sm">
            <RecalculateIcon />
            {t('contracts.actions.renew')}
          </SkeletonButton>
          <SkeletonButton size="sm">{t('contracts.actions.decide')}</SkeletonButton>
          <RowActionsSkeleton />
        </span>
      ),
      cell: (c) => (
        <span className="flex flex-nowrap items-center justify-end gap-2">
          <PrintContractButton contract={c} />
          {hasActions(c) ? <ContractActions contract={c} today={today} decideBelow="always" /> : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        label={t('contracts.history.tableLabel', { name })}
        columns={columns}
        rows={rows}
        loading={rows === undefined}
        cardHeightsVary
        getRowId={(c) => c.id}
        refreshing={pending}
        error={error}
        retrying={pending && error}
        onRetry={() => startTransition(() => router.refresh())}
        empty={
          <EmptyState
            icon={ContractEndIcon}
            title={t('contracts.history.emptyTitle')}
            description={t('contracts.history.emptyBody')}
            action={newContract}
          />
        }
        toolbar={newContract && rows?.length ? <div className="flex w-full justify-end">{newContract}</div> : undefined}
        pagination={{ page, limit, total, onPageChange: goToPage }}
        // Each contract's printed copies, under its row (contract templates spec → Printed copies).
        rowDetail={(c) => (c.copies?.length ? <ContractCopiesBlock contractId={c.id} copies={c.copies} total={c.copiesTotal} /> : null)}
        cardsBelow={1100}
      />
      {canCreate ? (
        <NewContractDialog
          employeeId={employeeId}
          name={name}
          today={today}
          open={creating}
          onOpenChange={setCreating}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

/** The Contracts tab inside the profile layout: the layout's employee, no second fetch. */
export function ProfileEmployeeContracts(props: Omit<EmployeeContractsProps, 'employee'>) {
  return <EmployeeContracts {...props} employee={useProfileEmployeeIfLoaded()} />;
}

/** What happened on a contract, one line each: who decided, the notice, the early termination, the end. */
function Details({ contract: c }: { contract: Contract }) {
  const { t, locale } = useTranslation();
  const day = (d: string) => formatDate(d, locale);
  const lines: ReactNode[] = [];
  const sub = decisionSubLine(c, t, locale);
  if (sub) lines.push(sub);
  // The not-renewing decision's note (the school's too).
  if (c.note) lines.push(<DecisionNote key="decision-note" note={c.note} />);
  if (c.notice && c.decision !== 'NOTICE') lines.push(t('contracts.history.noticeReceived', { date: day(c.notice.receivedOn) }));
  if (c.notice && c.notice.timing !== CalendarTiming.ON_TIME) lines.push(t(`contracts.tags.${c.notice.timing}`));
  const et = c.earlyTermination;
  if (et && et.status !== EarlyTerminationStatus.REQUESTED) {
    lines.push(
      `${t('contracts.history.earlyRequested', { date: day(et.requestedOn) })} · ${t(`common.enums.earlyTerminationStatus.${et.status}`)}`,
    );
    if (et.status === EarlyTerminationStatus.REJECTED && et.rejectReason) {
      lines.push(<SlotText key="reject" text={t('contracts.history.earlyRejected', { reason: TEXT_SLOT })} slot={<BidiText>{et.rejectReason}</BidiText>} />);
    }
  }
  if (c.endReason && c.endedOn) {
    lines.push(t('contracts.history.endReason', { reason: t(`common.enums.contractEndReason.${c.endReason}`), date: day(c.endedOn) }));
  }
  if (c.endNote) lines.push(<BidiText key="note">{c.endNote}</BidiText>);
  if (c.next) lines.push(t('contracts.sub.renewedTo', { start: day(c.next.startsOn), end: day(c.next.endsOn) }));
  if (lines.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5 text-xs break-words text-muted-foreground">
      {lines.map((line, i) => (
        <span key={i}>{line}</span>
      ))}
    </span>
  );
}

/**
 * The contract's documents: its signed copy ("Signed copy (2)", opening the viewer, or "No signed
 * copy" — a cancelled contract never had one to sign), then the notice letter, the request and the
 * end's attachment as links.
 */
function Documents({ contract: c }: { contract: Contract }) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState(false);
  const docs = [
    { key: 'notice', url: c.notice?.fileUrl },
    { key: 'request', url: c.earlyTermination?.fileUrl },
    { key: 'attachment', url: c.endFileUrl },
  ].filter((d): d is { key: string; url: string } => !!d.url);
  const signedCopy = c.status !== ContractStatus.CANCELLED || c.signedCopyPages > 0;
  if (docs.length === 0 && !signedCopy) return <span className="text-xs text-muted-foreground">{t('contracts.history.noDocuments')}</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      {signedCopy ? (
        <>
          <SignedCopyLink contract={c} onOpen={() => setViewing(true)} />
          {c.signedCopyPages > 0 ? <SignedCopyViewer contract={c} open={viewing} onOpenChange={setViewing} /> : null}
        </>
      ) : null}
      {docs.map((d) => (
        <a
          key={d.key}
          href={d.url}
          target="_blank"
          rel="noreferrer"
          className="tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-xs font-semibold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
        >
          <OpenIcon className="size-4 shrink-0" />
          {t(`contracts.history.docs.${d.key}`)}
        </a>
      ))}
    </span>
  );
}
