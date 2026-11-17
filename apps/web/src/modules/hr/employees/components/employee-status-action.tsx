'use client';

import { EmployeeStatus, type Employee } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { DeactivateIcon, ReactivateIcon } from '@/shared/components/ui/icons';
import { callApi } from '@/lib/callApi';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { DEACTIVATE_EMPLOYEE, REACTIVATE_EMPLOYEE } from '../apis';

/**
 * Deactivate (an active employee) or reactivate (an inactive one), each behind a confirmation.
 * The record is never deleted (§3); the dialog stays open if the request fails.
 */
export function EmployeeStatusAction({ employee }: { employee: Pick<Employee, 'id' | 'nameEn' | 'nameAr' | 'status'> }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = employee.status === EmployeeStatus.ACTIVE;
  const name = localName(employee, locale);

  async function confirm() {
    const res = await callApi(active ? DEACTIVATE_EMPLOYEE(employee.id) : REACTIVATE_EMPLOYEE(employee.id), {
      showSuccessToast: true,
    });
    if (!res.success) return false;
    router.refresh();
    return true;
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {active ? <DeactivateIcon /> : <ReactivateIcon />}
        {active ? t('employees.status.deactivate') : t('employees.status.reactivate')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone={active ? 'destructive' : 'primary'}
        title={active ? t('employees.status.deactivateTitle', { name }) : t('employees.status.reactivateTitle', { name })}
        description={active ? t('employees.status.deactivateBody') : t('employees.status.reactivateBody')}
        confirmLabel={active ? t('employees.status.deactivate') : t('employees.status.reactivate')}
        onConfirm={confirm}
      />
    </>
  );
}
