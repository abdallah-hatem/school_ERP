'use client';

import { FormActionBar } from '@/shared/components/form/form-action-bar';
import type { ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
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
    <section
      // Its height follows what it holds (a list's rows); its header and body are measured inside.
      data-skeleton-block="section-panel"
      data-skeleton-measure="width"
      className={cn('flex min-w-0 flex-col gap-5 rounded-3xl bg-card p-5 shadow-card sm:p-6', className)}
    >
      <header data-skeleton-block="section-header" className="flex flex-wrap items-start justify-between gap-3">
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
 * While there are unsaved changes it sticks to the bottom of the viewport (inside its form, above
 * the phone's home indicator) so Save is reachable from anywhere in a long form; it is sticky, not
 * fixed, so it never covers the end of the form. Place it as a direct child of the `<form>`.
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
    <FormActionBar
      sticky={dirty}
      status={
        <p role="status" className={cn(dirty && !valid ? 'text-destructive-ink' : 'text-muted-foreground')}>
          {status}
        </p>
      }
    >
      <Button variant="ghost" disabled={!dirty || saving} onClick={onDiscard}>
        {t('settings.save.discard')}
      </Button>
      <Button type="submit" variant="primary" disabled={!dirty || !valid} loading={saving}>
        {t('common.actions.save')}
      </Button>
    </FormActionBar>
  );
}
