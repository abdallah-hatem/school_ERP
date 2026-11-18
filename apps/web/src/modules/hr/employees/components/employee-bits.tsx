'use client';

import { EmployeeStatus, type Gender, type Names } from '@school-erp/shared';
import { EmployeeLink } from '@/core/employees';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** Avatar (photo, else the gendered silhouette) + name + code, as in the Campus tables. The name opens the profile. */
export function EmployeeIdentity({
  employee,
  size = 'sm',
}: {
  employee: Names & { id: string; code: string; photoUrl?: string | null; gender?: Gender | null };
  size?: 'sm' | 'lg';
}) {
  const { locale } = useTranslation();
  const name = localName(employee, locale);
  const nameClass = cn('font-bold break-words', size === 'lg' ? 'text-base' : 'text-sm');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar photoUrl={employee.photoUrl} gender={employee.gender} size={size === 'lg' ? 'md' : 'sm'} />
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
    <StatusPill tone={status === EmployeeStatus.ACTIVE ? 'success' : 'neutral'} hollow={status !== EmployeeStatus.ACTIVE}>
      {t(`common.enums.employeeStatus.${status}`)}
    </StatusPill>
  );
}
