'use client';

import type { ReactNode } from 'react';
import { Label } from '@/shared/components/ui/label';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

export interface FieldA11y {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

/**
 * Label (with the required asterisk), control, hint and the inline error, in the current language.
 * An error message may be a translation key (`hr.employees.errors.nationalId`) or ready text —
 * zod schemas carry keys so the same schema serves both languages.
 */
export function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  aside,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  /** Right of the hint row, e.g. a character counter. */
  aside?: ReactNode;
  className?: string;
  children: (a11y: FieldA11y) => ReactNode;
}) {
  const { t, has } = useTranslation();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const message = error ? (has(error) ? t(error) : error) : null;

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ms-0.5 text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
      {message || hint || aside ? (
        <div className="flex items-start justify-between gap-3 text-xs">
          <div className="flex min-w-0 flex-col gap-1">
            {message ? (
              <p id={errorId} className="font-semibold text-destructive-ink">
                {message}
              </p>
            ) : null}
            {hint ? (
              <p id={hintId} className="text-muted-foreground">
                {hint}
              </p>
            ) : null}
          </div>
          {aside ? <div className="shrink-0 text-muted-foreground">{aside}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
