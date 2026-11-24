'use client';

import { usePathname } from 'next/navigation';
import { RecordHistorySkeleton } from '@/core/audit';
import { EmployeeContractsSkeleton } from '@/modules/hr/contracts';
import { EmployeePageSkeleton, EmployeeProfileSkeleton } from '@/modules/hr/employees';
import { EmployeePayrollSkeleton } from '@/modules/hr/payroll';
import { EmployeePenaltiesSkeleton } from '@/modules/hr/penalties';

/**
 * First visit to anything under `/employees/<id>`: this boundary wraps the profile layout and the
 * edit page, so on a hard load it is what shows — never the nested tab's own `loading.tsx`. It
 * draws the page being opened: the edit form, or the profile header and tabs over the opened tab
 * (the same tab skeletons a tab switch shows). Tab switches never reach it — the profile layout
 * stays mounted.
 */
export default function EmployeeLoading() {
  // `/<locale>/employees/<id>/<tab>`
  const segment = usePathname()?.split('/')[4] ?? '';
  if (segment === 'edit') return <EmployeePageSkeleton />;
  const body =
    segment === 'contracts' ? (
      <EmployeeContractsSkeleton />
    ) : segment === 'penalties' ? (
      <EmployeePenaltiesSkeleton />
    ) : segment === 'payroll' ? (
      <EmployeePayrollSkeleton />
    ) : segment === 'history' ? (
      <RecordHistorySkeleton />
    ) : undefined;
  return <EmployeeProfileSkeleton body={body} />;
}
