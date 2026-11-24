'use client';

import { ContractDecision, type Contract, type SchoolCalendarDates } from '@school-erp/shared';
import type { ReactNode } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import type { PaginationState } from '@/shared/components/data-table/pagination';
import { RowActionsSkeleton } from '@/shared/components/data-table/row-actions';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { StageIcon } from '@/shared/components/ui/icons';
import { Skeleton, SkeletonButton, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { RecalculateIcon } from '@/shared/components/ui/icons';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { ContractActions } from './contract-actions';
import { ContractDates, ContractEmployee, ContractEmployeeSkeleton, DecisionCell, DecisionCellSkeleton } from './contract-bits';

/** Row ticking for "Renew selected": which rows may be ticked, which are, and the handlers. */
export interface ContractSelection {
  selectable: (c: Contract) => boolean;
  isSelected: (id: string) => boolean;
  toggle: (c: Contract, on: boolean) => void;
  /** The page's selectable rows: all ticked (`true`), some (`'indeterminate'`) or none. */
  pageState: boolean | 'indeterminate';
  togglePage: (on: boolean) => void;
  /** No row on the page can be ticked: the header box is disabled. */
  pageEmpty: boolean;
}

/**
 * The renewal list as the shared table (cards below 1100px): employee (with the tick box), stage,
 * contract dates, the decision with its tags and line, and the row's next step with its ⋯ menu.
 * An ended contract with no decision carries the red bar; a waiting early termination the amber one.
 */
export function ContractsTable({
  label,
  rows,
  today,
  calendar,
  historyHref,
  selection,
  refreshing,
  error,
  onRetry,
  retrying,
  empty,
  pagination,
  toolbar,
}: {
  label: string;
  /** `undefined` while the first page loads: skeleton rows of the same shape. */
  rows: Contract[] | undefined;
  today: string;
  /** The listed year's calendar (the decision sheet's timing line); null: not set. */
  calendar: SchoolCalendarDates | null | undefined;
  /** The employee's Contracts tab. */
  historyHref: (employeeId: string) => string;
  /** Without it (no `hr.contracts.manage`) rows have no tick boxes. */
  selection?: ContractSelection;
  refreshing?: boolean;
  error?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  empty: ReactNode;
  pagination: PaginationState;
  toolbar?: ReactNode;
}) {
  const { t, locale } = useTranslation();

  const columns: DataTableColumn<Contract>[] = [
    {
      id: 'employee',
      header: selection ? (
        <span className="flex items-center gap-3">
          <Checkbox
            aria-label={t('contracts.columns.selectAll')}
            checked={selection.pageState}
            disabled={selection.pageEmpty || rows === undefined}
            onCheckedChange={(on) => selection.togglePage(on === true)}
          />
          {t('contracts.columns.employee')}
        </span>
      ) : (
        t('contracts.columns.employee')
      ),
      cardLabel: t('contracts.columns.employee'),
      className: 'min-w-56 whitespace-normal',
      card: 'title',
      skeleton: (
        <span className="flex items-center gap-3">
          {selection ? <Skeleton className="size-5 shrink-0 rounded-[0.3rem]" /> : null}
          <ContractEmployeeSkeleton />
        </span>
      ),
      cell: (c) => (
        <span className="flex items-center gap-3">
          {selection ? (
            <Checkbox
              aria-label={t('contracts.columns.selectRow', { name: localName(c.employee, locale) })}
              checked={selection.isSelected(c.id)}
              disabled={!selection.selectable(c)}
              onCheckedChange={(on) => selection.toggle(c, on === true)}
              className="tap-target"
            />
          ) : null}
          <ContractEmployee contract={c} />
        </span>
      ),
    },
    {
      id: 'stage',
      header: t('contracts.columns.stage'),
      className: 'w-32 whitespace-normal',
      skeleton: <SkeletonPill />,
      cell: (c) =>
        c.employee.stage.isNoStage ? (
          <span className="text-muted-foreground">{t('contracts.noStage')}</span>
        ) : (
          <StatusPill tone="neutral" icon={StageIcon}>
            {localName(c.employee.stage, locale)}
          </StatusPill>
        ),
    },
    {
      id: 'contract',
      header: t('contracts.columns.contract'),
      className: 'w-36 whitespace-normal',
      skeleton: <SkeletonText width="w-28" />,
      cell: (c) => <ContractDates contract={c} />,
    },
    {
      id: 'decision',
      header: t('contracts.columns.decision'),
      className: 'min-w-56 whitespace-normal',
      card: 'wide',
      skeleton: <DecisionCellSkeleton />,
      cell: (c) => <DecisionCell contract={c} />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('contracts.columns.actions')}</span>,
      cardLabel: t('contracts.columns.actions'),
      align: 'end',
      className: 'w-60',
      card: 'actions',
      skeleton: (
        <span className="flex items-center justify-end gap-2">
          <SkeletonButton size="sm">
            <RecalculateIcon />
            {t('contracts.actions.renew')}
          </SkeletonButton>
          <RowActionsSkeleton />
        </span>
      ),
      cell: (c) => (
        <ContractActions
          contract={c}
          today={today}
          calendar={calendar}
          historyHref={historyHref(c.employee.id)}
        />
      ),
    },
  ];

  return (
    <DataTable
      label={label}
      columns={columns}
      rows={rows}
      loading={rows === undefined}
      cardHeightsVary
      getRowId={(c) => c.id}
      refreshing={refreshing}
      error={error}
      onRetry={onRetry}
      retrying={retrying}
      empty={empty}
      pagination={pagination}
      toolbar={toolbar}
      rowTone={(c) =>
        c.decision === ContractDecision.ENDED_NO_DECISION
          ? 'danger'
          : c.decision === ContractDecision.EARLY_REQUESTED
            ? 'warning'
            : undefined
      }
      cardsBelow={1100}
    />
  );
}
