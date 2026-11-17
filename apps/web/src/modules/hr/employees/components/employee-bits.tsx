'use client';

import { EmployeeStatus, type Names } from '@school-erp/shared';
import Link from 'next/link';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { initialsOf } from '@/shared/lib/initials';

export { initialsOf };

/** Sunflower initials tile + name + code, as in the Campus tables. A link when `href` is given. */
export function EmployeeIdentity({
  employee,
  href,
  size = 'sm',
}: {
  employee: Names & { code: string };
  href?: string;
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
      <span className="flex min-w-0 flex-col whitespace-normal">
        {href ? (
          <Link href={href} className={cn(nameClass, 'cursor-pointer rounded-sm hover:text-primary hover:underline')}>
            {name}
          </Link>
        ) : (
          <span className={nameClass}>{name}</span>
        )}
        <span dir="ltr" className="tabular self-start text-xs text-muted-foreground">
          {employee.code}
        </span>
      </span>
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
