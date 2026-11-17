'use client';

import type { ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** One card of a settings section: heading, one-line description, optional actions, body. */
export function SectionPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-5 rounded-3xl bg-card p-5 shadow-card sm:p-6', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
          <h2 className="font-display text-lg leading-tight font-extrabold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * Footer of a settings form: what state the edits are in, Discard and Save. Save is disabled while
 * the form is unchanged, invalid or saving (and shows busy while saving, so it can't fire twice).
 */
export function SaveBar({
  dirty,
  valid,
  saving,
  saved,
  onDiscard,
}: {
  dirty: boolean;
  valid: boolean;
  saving: boolean;
  /** Just saved and untouched since. */
  saved: boolean;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const status = dirty ? (valid ? t('settings.save.unsaved') : t('settings.save.fixErrors')) : saved ? t('settings.save.saved') : null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
      <p role="status" className={cn('me-auto text-sm', dirty && !valid ? 'text-destructive-ink' : 'text-muted-foreground')}>
        {status}
      </p>
      <Button variant="ghost" disabled={!dirty || saving} onClick={onDiscard}>
        {t('settings.save.discard')}
      </Button>
      <Button type="submit" variant="primary" disabled={!dirty || !valid} loading={saving}>
        {t('common.actions.save')}
      </Button>
    </div>
  );
}

/** Skeleton in the shape of a settings form card. */
export function FormSkeleton({ fields }: { fields: number }) {
  return (
    <div className="flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-card sm:p-6" aria-hidden="true">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
