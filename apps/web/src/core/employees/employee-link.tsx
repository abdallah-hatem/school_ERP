'use client';

import Link from 'next/link';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { useCan } from '../auth';

/** The employee's profile: `/ar/employees/<id>`. */
export function employeePath(locale: Locale, employeeId: string): string {
  return `/${locale}/employees/${encodeURIComponent(employeeId)}`;
}

export interface EmployeeLinkProps {
  employeeId: string;
  /** The name as the screen shows it (already in the screen's language). */
  name: ReactNode;
  /** The employee code, on a line of its own under the name (Latin, left to right). */
  code?: string;
  /** More on the code's line after a "·" (or alone when there is no code), e.g. the department. */
  detail?: ReactNode;
  /** Classes for the name (weight, size): it keeps the look of the text it replaces. */
  className?: string;
  /** Classes for the wrapper, when there is a code or detail line. */
  wrapperClassName?: string;
}

// The name never triggers the row it sits in: a click or Enter opens the profile and nothing else.
const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

/**
 * An employee's name that opens their profile — the rule wherever an employee's name is shown.
 * It reads as the name (no blue, no underline) until hovered (underline) or focused (ring), reaches
 * 44px to a finger (`tap-target`), and is plain text for someone without `hr.employees.view`.
 */
export function EmployeeLink({ employeeId, name, code, detail, className, wrapperClassName }: EmployeeLinkProps) {
  const { locale } = useTranslation();
  const canView = useCan()('hr.employees.view');

  const label = canView ? (
    <Link
      href={employeePath(locale, employeeId)}
      onClick={stop}
      onKeyDown={stop}
      className={cn(
        'tap-target cursor-pointer rounded-sm break-words decoration-2 underline-offset-3 transition-colors duration-150',
        'hover:text-primary hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
        className,
      )}
    >
      {name}
    </Link>
  ) : (
    <span className={cn('break-words', className)}>{name}</span>
  );

  if (!code && !detail) return label;
  return (
    <span className={cn('flex min-w-0 flex-col items-start', wrapperClassName)}>
      {label}
      <span className="text-xs text-muted-foreground">
        {code ? (
          <bdi dir="ltr" className="tabular">
            {code}
          </bdi>
        ) : null}
        {code && detail ? <span aria-hidden="true"> · </span> : null}
        {detail}
      </span>
    </span>
  );
}
