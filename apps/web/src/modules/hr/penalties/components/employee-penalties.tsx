'use client';

import { useCan } from '@/core/auth';
import { EmployeeStatus, PAGINATION, type Employee, type PenaltyRecord } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SelectOptionGroup } from '@/shared/components/form/fields';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { AddIcon } from '@/shared/components/ui/icons';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { useProfileEmployeeIfLoaded } from '../../employees';
import { employeeOptions } from '../lib/penalty-text';
import { PenaltiesTable } from './penalties-table';
import { RecordPenaltyDialog } from './record-penalty-dialog';

export interface EmployeePenaltiesProps {
  /** `/ar/employees`. */
  employeesPath: string;
  /** null only in the tab's skeleton on a first visit (the profile layout is still loading it). */
  employee: Employee | null;
  /** `undefined` while the tab loads: skeleton rows, the record button disabled. */
  rows: PenaltyRecord[] | undefined;
  total: number;
  page: number;
  limit: number;
  error?: boolean;
  violations: SelectOptionGroup[];
}

/**
 * The profile's "Penalties" section: the employee's penalties across every month, newest first,
 * with the same row actions as the list. An active employee can get a new one from here.
 */
export function EmployeePenalties({ employeesPath, employee, rows, total, page, limit, error = false, violations }: EmployeePenaltiesProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  // Not loaded yet (the skeleton): drawn as the usual case, an active employee.
  const active = employee ? employee.status === EmployeeStatus.ACTIVE : true;
  const tabPath = `${employeesPath}/${employee?.id ?? ''}/penalties`;

  function go(nextPage: number, nextLimit: number) {
    const params = new URLSearchParams();
    if (nextPage !== PAGINATION.defaultPage) params.set('page', String(nextPage));
    if (nextLimit !== PAGINATION.defaultLimit) params.set('limit', String(nextLimit));
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${tabPath}?${qs}` : tabPath, { scroll: false }));
  }

  const canRecord = useCan()('hr.penalties.record');
  const recordButton = active && canRecord ? (
    <Button variant="primary" className="cursor-pointer" disabled={rows === undefined} onClick={() => setRecording(true)}>
      <AddIcon />
      {t('penalties.record')}
    </Button>
  ) : null;

  return (
    <>
      <PenaltiesTable
        label={employee ? t('penalties.profileTableLabel', { name: nameIn(employee, locale) }) : t('ui.states.loading')}
        rows={rows}
        showEmployee={false}
        refreshing={pending}
        error={error}
        retrying={pending && error}
        onRetry={() => startTransition(() => router.refresh())}
        empty={
          <EmptyState
            title={t('penalties.list.profileEmptyTitle')}
            description={t('penalties.list.profileEmptyBody')}
            action={recordButton}
          />
        }
        pagination={{
          page,
          limit,
          total,
          onPageChange: (p) => go(p, limit),
        }}
        toolbar={recordButton ? <div className="flex w-full justify-end">{recordButton}</div> : undefined}
      />
      {employee && active ? (
        <RecordPenaltyDialog
          open={recording}
          onOpenChange={setRecording}
          employees={employeeOptions([employee], locale)}
          violations={violations}
          employeeId={employee.id}
        />
      ) : null}
    </>
  );
}

/**
 * The tab inside the profile layout: the employee is the one the layout already loaded (and
 * refreshes after deactivate / reactivate), so the tab never fetches it again.
 */
export function ProfileEmployeePenalties(props: Omit<EmployeePenaltiesProps, 'employee'>) {
  return <EmployeePenalties {...props} employee={useProfileEmployeeIfLoaded()} />;
}
