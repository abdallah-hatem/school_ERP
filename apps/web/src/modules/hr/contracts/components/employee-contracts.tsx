'use client';

import {
  CalendarTiming,
  EarlyTerminationStatus,
  formatContractYear,
  PAGINATION,
  type Contract,
  type Employee,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActionsSkeleton } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { ContractEndIcon, OpenIcon } from '@/shared/components/ui/icons';
import { SkeletonButton, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { SlotText, TEXT_SLOT } from '@/shared/components/ui/slot-text';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { useProfileEmployeeIfLoaded } from '../../employees';
import { ContractActions } from './contract-actions';
import { ContractDates, ContractDecisionPill, decisionSubLine } from './contract-bits';

export interface EmployeeContractsProps {
  employeeId: string;
  /** The profile's employee (its name, and its current contract's start); null before it loads. */
  employee: Pick<Employee, 'id' | 'nameEn' | 'nameAr' | 'contractStart'> | null;
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
  // The record's current contract is the one its dates name (written only by Contracts).
  const isCurrent = (c: Contract) => !!employee && employee.id === employeeId && c.startsOn === employee.contractStart;

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
      className: 'w-28',
      card: 'title',
      skeleton: <SkeletonText className="font-bold" width="w-16" />,
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-2">
          <bdi dir="ltr" className="tabular font-bold">
            {formatContractYear(c.year)}
          </bdi>
          {isCurrent(c) ? <StatusPill tone="primary">{t('contracts.history.current')}</StatusPill> : null}
        </span>
      ),
    },
    {
      id: 'dates',
      header: t('contracts.history.columns.dates'),
      className: 'w-36 whitespace-normal',
      skeleton: <SkeletonText width="w-28" />,
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
      className: 'w-36 whitespace-normal',
      skeleton: <SkeletonText className="text-xs" width="w-20" />,
      cell: (c) => <Documents contract={c} />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('contracts.columns.actions')}</span>,
      cardLabel: t('contracts.columns.actions'),
      align: 'end',
      className: 'w-56',
      card: 'actions',
      skeleton: (
        <span className="flex items-center justify-end gap-2">
          <SkeletonButton size="sm">{t('contracts.actions.decide')}</SkeletonButton>
          <RowActionsSkeleton />
        </span>
      ),
      cell: (c) => (isCurrent(c) ? <ContractActions contract={c} today={today} decideBelow="always" /> : null),
    },
  ];

  return (
    <DataTable
      label={t('contracts.history.tableLabel', { name: employee ? localName(employee, locale) : '' })}
      columns={columns}
      rows={rows}
      loading={rows === undefined}
      cardHeightsVary
      getRowId={(c) => c.id}
      refreshing={pending}
      error={error}
      retrying={pending && error}
      onRetry={() => startTransition(() => router.refresh())}
      empty={<EmptyState icon={ContractEndIcon} title={t('contracts.history.emptyTitle')} description={t('contracts.history.emptyBody')} />}
      pagination={{ page, limit, total, onPageChange: goToPage }}
      cardsBelow={1100}
    />
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

/** The contract's documents (the notice letter, the request, the end's attachment) as links. */
function Documents({ contract: c }: { contract: Contract }) {
  const { t } = useTranslation();
  const docs = [
    { key: 'notice', url: c.notice?.fileUrl },
    { key: 'request', url: c.earlyTermination?.fileUrl },
    { key: 'attachment', url: c.endFileUrl },
  ].filter((d): d is { key: string; url: string } => !!d.url);
  if (docs.length === 0) return <span className="text-xs text-muted-foreground">{t('contracts.history.noDocuments')}</span>;
  return (
    <span className="flex flex-col items-start gap-1">
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
