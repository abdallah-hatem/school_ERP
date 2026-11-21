'use client';

import { EmployeeStatus, type Gender, type NamedRef, type Names } from '@school-erp/shared';
import { EmployeeLink } from '@/core/employees';
import { StageIcon } from '@/shared/components/ui/icons';
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

/**
 * "Also teaches in" (§3, owner 2026-11-21): the employee's other stages as small tags, in stage
 * order. `compact`: on a card's band ("+ Preparatory"). Nothing when there are none.
 */
export function OtherStageTags({
  stages,
  compact = false,
  className,
}: {
  stages: readonly NamedRef[];
  compact?: boolean;
  className?: string;
}) {
  const { t, locale } = useTranslation();
  if (stages.length === 0) return null;
  return (
    <ul aria-label={t('employees.fields.otherStages')} className={cn('flex min-w-0 flex-wrap gap-1.5', className)} data-testid="other-stage-tags">
      {stages.map((s) => (
        <li
          key={s.id}
          className={cn(
            'inline-flex min-w-0 items-center gap-1 rounded-full font-bold',
            compact ? 'bg-card/60 px-2 py-0.5 text-[0.72rem]' : 'bg-info-soft px-2.5 py-0.5 text-xs text-info-ink',
          )}
        >
          {compact ? <span aria-hidden="true">+</span> : <StageIcon className="size-3.5 shrink-0" />}
          <span className="truncate">{localName(s, locale)}</span>
        </li>
      ))}
    </ul>
  );
}
