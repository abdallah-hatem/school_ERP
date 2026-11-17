'use client';

import type { ReactNode } from 'react';
import { EmptyIcon, ErrorIcon, RetryIcon, type AppIcon } from '@/shared/components/ui/icons';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

interface StateProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: AppIcon;
  className?: string;
}

function StateFrame({
  icon: Icon,
  tone,
  title,
  description,
  action,
  className,
  role,
}: StateProps & {
  icon: AppIcon;
  tone: 'neutral' | 'danger';
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role}
      className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}
    >
      <span
        className={cn(
          'grid size-14 place-items-center rounded-2xl',
          tone === 'danger' ? 'bg-destructive-soft text-destructive-ink' : 'bg-primary-soft text-primary',
        )}
      >
        <Icon className="size-7" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-display text-base font-extrabold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Nothing to show yet. An empty screen is an invitation to act: pass the action that fills it. */
export function EmptyState({ title, description, icon, action, className }: StateProps & { action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <StateFrame
      role="status"
      tone="neutral"
      icon={icon ?? EmptyIcon}
      title={title ?? t('ui.states.emptyTitle')}
      description={description ?? t('ui.states.emptyBody')}
      action={action}
      className={className}
    />
  );
}

/** A load failed. Says what happened and offers the way out (retry). */
export function ErrorState({
  title,
  description,
  icon,
  onRetry,
  retrying = false,
  className,
}: StateProps & { onRetry?: () => void; retrying?: boolean }) {
  const { t } = useTranslation();
  return (
    <StateFrame
      role="alert"
      tone="danger"
      icon={icon ?? ErrorIcon}
      title={title ?? t('ui.states.errorTitle')}
      description={description ?? t('ui.states.errorBody')}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            {retrying ? null : <RetryIcon />}
            {t('ui.states.retry')}
          </Button>
        ) : null
      }
      className={className}
    />
  );
}
