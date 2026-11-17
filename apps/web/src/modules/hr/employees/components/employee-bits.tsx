'use client';

import { EmployeeStatus, type Names } from '@school-erp/shared';
import { EmployeeLink } from '@/core/employees';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { initialsOf } from '@/shared/lib/initials';

export { initialsOf };

/** Sunflower initials tile + name + code, as in the Campus tables. The name opens the profile. */
export function EmployeeIdentity({
  employee,
  size = 'sm',
}: {
  employee: Names & { id: string; code: string };
  size?: 'sm' | 'lg';
}) {
  const { locale } = useTranslation();
  const name = localName(employee, locale);
  const nameClass = cn('font-bold break-words', size === 'lg' ? 'text-base' : 'text-sm');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center bg-accent font-display font-extrabold text-accent-foreground',
          size === 'lg' ? 'size-14 rounded-2xl text-lg' : 'size-9 rounded-xl text-xs',
        )}
      >
        {initialsOf(name)}
      </span>
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
