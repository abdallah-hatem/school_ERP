'use client';

import { PenaltyStatus, type PenaltyRecord } from '@school-erp/shared';
import type { ReactNode } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import type { PaginationState } from '@/shared/components/data-table/pagination';
import { StatusPill, type StatusTone } from '@/shared/components/ui/status-pill';
import { formatDate } from '@/shared/lib/format';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { EmployeeIdentity } from '../../employees';
import { describeAction } from '../lib/penalty-text';
import { PenaltyActions } from './penalty-actions';

const STATUS_TONE: Record<PenaltyStatus, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  CANCELLED: 'neutral',
};

export function PenaltyStatusPill({ status }: { status: PenaltyStatus }) {
  const { t } = useTranslation();
  return <StatusPill tone={STATUS_TONE[status]}>{t(`common.enums.penaltyStatus.${status}`)}</StatusPill>;
}

/**
 * Penalty records as the shared table (cards on narrow containers): date, employee, violation,
 * level, action with days, status and the row actions. The profile tab hides the employee column.
 * Pending rows carry the warning bar (they need a look before payroll).
 */
export function PenaltiesTable({
  label,
  rows,
  employeesPath,
  showEmployee = true,
  refreshing,
  error,
  onRetry,
  retrying,
  empty,
  pagination,
  toolbar,
}: {
  label: string;
  rows: PenaltyRecord[];
  /** `/ar/employees` — the employee cell links to the profile. */
  employeesPath: string;
  showEmployee?: boolean;
  refreshing?: boolean;
  error?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  empty: ReactNode;
  pagination: PaginationState;
  toolbar?: ReactNode;
}) {
  const { t, locale } = useTranslation();

  const columns: DataTableColumn<PenaltyRecord>[] = [
    {
      id: 'date',
      header: t('penalties.columns.date'),
      className: 'w-32',
      card: showEmployee ? 'field' : 'title',
      cell: (p) => (
        <bdi dir="ltr" className="tabular">
          {formatDate(p.date, locale)}
        </bdi>
      ),
    },
    ...(showEmployee
      ? [
          {
            id: 'employee',
            header: t('penalties.columns.employee'),
            className: 'min-w-44 whitespace-normal',
            card: 'title' as const,
            cell: (p: PenaltyRecord) => <EmployeeIdentity employee={p.employee} href={`${employeesPath}/${p.employee.id}`} />,
          },
        ]
      : []),
    {
      id: 'violation',
      header: t('penalties.columns.violation'),
      className: 'min-w-48 whitespace-normal',
      cell: (p) => <span className="break-words">{nameIn(p.violation, locale)}</span>,
    },
    {
      id: 'level',
      header: t('penalties.columns.level'),
      className: 'w-24',
      cell: (p) => t('penalties.levelValue', { level: p.level }),
    },
    {
      id: 'action',
      header: t('penalties.columns.action'),
      className: 'min-w-44 whitespace-normal',
      cell: (p) => (
        <span className={p.days ? 'font-semibold text-destructive-ink' : undefined}>{describeAction(t, p.action, p.days)}</span>
      ),
    },
    {
      id: 'status',
      header: t('penalties.columns.status'),
      className: 'w-36 whitespace-normal',
      card: 'status',
      cell: (p) => (
        <span className="flex flex-col items-start gap-1">
          <PenaltyStatusPill status={p.status} />
          {p.status === PenaltyStatus.CANCELLED && p.cancelReason ? (
            <span className="max-w-48 text-xs break-words text-muted-foreground">
              {t('penalties.cancelledBecause', { reason: p.cancelReason })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('penalties.columns.actions'),
      className: 'w-52',
      cell: (p) => <PenaltyActions record={p} />,
    },
  ];

  return (
    <DataTable
      label={label}
      columns={columns}
      rows={rows}
      getRowId={(p) => p.id}
      refreshing={refreshing}
      error={error}
      onRetry={onRetry}
      retrying={retrying}
      empty={empty}
      pagination={pagination}
      toolbar={toolbar}
      rowTone={(p) => (p.status === PenaltyStatus.PENDING ? 'warning' : undefined)}
    />
  );
}
