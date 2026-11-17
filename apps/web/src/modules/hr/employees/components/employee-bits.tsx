'use client';

import { EmployeeStatus, type Names } from '@school-erp/shared';
import { EmployeeAvatar, EmployeeLink } from '@/core/employees';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** Avatar (photo or silhouette) + name + code, as in the Campus tables. The name opens the profile. */
export function EmployeeIdentity({
  employee,
  size = 'sm',
}: {
  employee: Names & { id: string; code: string; photoUrl?: string | null };
  size?: 'sm' | 'lg';
}) {
  const { locale } = useTranslation();
  const name = localName(employee, locale);
  const nameClass = cn('font-bold break-words', size === 'lg' ? 'text-base' : 'text-sm');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <EmployeeAvatar photoUrl={employee.photoUrl} size={size === 'lg' ? 'md' : 'sm'} />
      <EmployeeLink
        employeeId={employee.id}
        name={name}
        code={employee.code}
        className={nameClass}
        wrapperClassName="whitespace-normal"
      />
    </div>
  );
}

export function EmployeeStatusPill({ status }: { status: EmployeeStatus }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={status === EmployeeStatus.ACTIVE ? 'success' : 'neutral'}>
      {t(`common.enums.employeeStatus.${status}`)}
    </StatusPill>
  );
}
