'use client';

import type { IsoDateTime, NotificationItem } from '@school-erp/shared';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { EmptyState, ErrorState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import {
  CloseIcon,
  MarkAllReadIcon,
  NotificationSettingsIcon,
  NotificationsIcon,
  ReadyIcon,
} from '@/shared/components/ui/icons';
import { Skeleton, SkeletonText } from '@/shared/components/ui/skeleton';
import { formatCount } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { groupItemText, linkHref, notificationText, resolvedText, whenText } from '../lib/text';
import { typeLook } from '../lib/type-look';

export type InboxStatus = 'all' | 'unread';

export interface NotificationPanelProps {
  /** `popover`: the desktop list under the bell; `sheet`: the phone's full-screen list. */
  variant: 'popover' | 'sheet';
  status: InboxStatus;
  onStatus: (status: InboxStatus) => void;
  /** Undefined while the first page loads. */
  items: NotificationItem[] | undefined;
  /** How many there are in all (the list shows the latest page). */
  total: number;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  unreadCount: number;
  markingAll: boolean;
  onMarkAll: () => void;
  /** A notification was opened: mark it read. */
  onOpen: (n: NotificationItem) => void;
  /** The list should close (a link was followed, ✕). */
  onClose: () => void;
  now: IsoDateTime;
  settingsHref: string;
}

/**
 * The notification list (option A of design/mockups/notifications.html): a header with "Mark all as
 * read", All / Unread, the latest notifications and a footer linking to the notification settings.
 * Opening one marks it read and follows its link; a group (N17) opens into its items first.
 */
export function NotificationPanel(props: NotificationPanelProps) {
  const { t } = useTranslation();
  const { variant, items, unreadCount } = props;
  const sheet = variant === 'sheet';
  const markAll = (
    <Button
      variant="ghost"
      size="sm"
      className="text-primary hover:text-primary"
      disabled={unreadCount === 0 || !items?.length}
      loading={props.markingAll}
      onClick={props.onMarkAll}
    >
      {props.markingAll ? null : <MarkAllReadIcon />}
      {sheet ? t('notifications.screen.markAllReadShort') : t('notifications.screen.markAllRead')}
    </Button>
  );

  return (
    <div className={cn('flex min-h-0 flex-col', sheet ? 'h-full' : 'max-h-[min(47.5rem,calc(100dvh-6rem))]')}>
      {sheet ? (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-card px-3.5 py-3">
          <Button variant="secondary" size="icon" className="size-10" aria-label={t('notifications.screen.close')} onClick={props.onClose}>
            <CloseIcon className="size-5" />
          </Button>
          <h2 className="font-display min-w-0 flex-1 truncate text-base font-extrabold">{t('notifications.title')}</h2>
          {markAll}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 px-4.5 pt-4 pb-2">
          <h2 className="font-display flex-1 text-[1.0625rem] font-extrabold">{t('notifications.title')}</h2>
          {markAll}
        </div>
      )}

      <div className={cn('shrink-0', sheet ? 'px-3.5 pt-1.5' : 'px-4.5')}>
        <StatusTabs status={props.status} onStatus={props.onStatus} unreadCount={unreadCount} />
      </div>

      <div className="scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <Body {...props} />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-3.5 py-2.5">
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link href={props.settingsHref} onClick={props.onClose}>
            <NotificationSettingsIcon />
            {t('notifications.screen.settingsLink')}
          </Link>
        </Button>
        {items && props.total > items.length ? (
          <span className="text-xs text-muted-foreground">{t('notifications.screen.latest', { n: items.length })}</span>
        ) : null}
      </div>
    </div>
  );
}

function StatusTabs({ status, onStatus, unreadCount }: { status: InboxStatus; onStatus: (s: InboxStatus) => void; unreadCount: number }) {
  const { t } = useTranslation();
  const tab = (value: InboxStatus, label: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={status === value}
      onClick={() => onStatus(value)}
      className={cn(
        '-mb-px flex h-10 cursor-pointer items-center gap-1.5 border-b-2 px-3.5 text-sm font-bold whitespace-nowrap transition-colors duration-150',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
        status === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label={t('notifications.screen.tabs.label')} className="flex gap-1 border-b border-border">
      {tab('all', t('notifications.screen.tabs.all'))}
      {tab(
        'unread',
        <>
          {t('notifications.screen.tabs.unread')}
          {unreadCount > 0 ? (
            <span className="tabular rounded-full bg-accent px-1.5 text-[0.6875rem] font-extrabold text-accent-foreground">
              {formatCount(unreadCount)}
            </span>
          ) : null}
        </>,
      )}
    </div>
  );
}

function Body(props: NotificationPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (props.failed && !props.items) {
    return <ErrorState description={t('notifications.screen.loadFailed')} onRetry={props.onRetry} retrying={props.retrying} className="py-8" />;
  }
  if (!props.items) return <RowsSkeleton />;
  if (props.items.length === 0) {
    const key = props.status === 'unread' ? 'emptyUnread' : 'empty';
    return (
      <EmptyState
        icon={NotificationsIcon}
        title={t(`notifications.screen.${key}.title`)}
        description={t(`notifications.screen.${key}.body`)}
        className="py-9"
      />
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {props.items.map((n) => (
        <NotificationRow
          key={n.id}
          n={n}
          now={props.now}
          expanded={expanded === n.id}
          onToggle={() => {
            setExpanded((cur) => (cur === n.id ? null : n.id));
            if (!n.readAt) props.onOpen(n);
          }}
          onOpen={() => props.onOpen(n)}
          onNavigate={props.onClose}
        />
      ))}
    </ul>
  );
}

/** While the list loads: rows of the same shape (icon chip, title, line, time). */
function RowsSkeleton() {
  const { t } = useTranslation();
  return (
    <ul aria-busy="true" className="flex flex-col gap-0.5">
      <li className="sr-only" role="status">
        {t('ui.states.loading')}
      </li>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-start gap-3 rounded-2xl px-3.5 py-3">
          <Skeleton className="size-9.5 shrink-0 rounded-xl" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SkeletonText className="text-[0.84375rem]" width={i % 2 ? 'w-48' : 'w-60'} />
            <SkeletonText className="text-xs" width="w-40" />
            <SkeletonText className="text-[0.71875rem]" width="w-16" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function NotificationRow({
  n,
  now,
  expanded,
  onToggle,
  onOpen,
  onNavigate,
}: {
  n: NotificationItem;
  now: IsoDateTime;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onNavigate: () => void;
}) {
  const { t, has, locale } = useTranslation();
  const deps = { t, has, locale, now };
  const { title, body } = notificationText(n, deps);
  const { icon: Icon, tone } = typeLook(n.type);
  const unread = !n.readAt;
  const done = n.resolved !== null;
  const group = n.items.length > 1;
  const href = group ? null : linkHref(n.link, locale);

  const content = (
    <>
      <span className={cn('grid size-9.5 shrink-0 place-items-center rounded-xl', tone, done && 'grayscale-[.8]')}>
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('text-[0.84375rem] leading-snug', done ? 'font-semibold' : 'font-bold')}>
          <bdi>{title}</bdi>
        </span>
        {body ? (
          <span className="mt-0.5 text-xs text-muted-foreground">
            <bdi>{body}</bdi>
          </span>
        ) : null}
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[0.71875rem] text-muted-foreground">
          <span className="tabular">{whenText(n.updatedAt, now, deps)}</span>
          {group && !expanded ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-primary">{t('notifications.screen.showAll', { n: n.items.length })}</span>
            </>
          ) : null}
          {n.resolved ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-bold text-success-ink">
                <ReadyIcon className="size-3.5" />
                <bdi>{resolvedText(n.resolved, deps, group)}</bdi>
              </span>
            </>
          ) : null}
        </span>
      </span>
      {unread ? (
        <span
          aria-label={t('notifications.screen.unread')}
          role="img"
          className="mt-1.5 size-2.25 shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_30%,transparent)]"
        />
      ) : null}
    </>
  );

  const rowClass = cn(
    'flex w-full cursor-pointer items-start gap-3 rounded-2xl px-3.5 py-3 text-start transition-colors duration-150',
    'focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring/55',
    unread ? 'hover:bg-primary-soft/40' : 'hover:bg-muted',
    done && 'opacity-75',
  );

  return (
    <li
      data-testid="notification-row"
      className={cn('rounded-2xl transition-colors duration-150', unread && 'bg-primary-soft/45', group && expanded && 'pb-2.5')}
    >
      {group ? (
        <button type="button" aria-expanded={expanded} className={rowClass} onClick={onToggle}>
          {content}
        </button>
      ) : href ? (
        <Link
          href={href}
          className={rowClass}
          onClick={() => {
            onOpen();
            onNavigate();
          }}
        >
          {content}
        </Link>
      ) : (
        <button type="button" className={rowClass} onClick={onOpen}>
          {content}
        </button>
      )}
      {group && expanded ? (
        <ul className="ms-[3.875rem] me-3.5 -mt-1.5 flex flex-col gap-0.5 border-s-2 border-border ps-3">
          {n.items.map((item) => {
            const line = groupItemText(n.type, item, deps);
            const itemHref = linkHref(item.link, locale);
            const inner = (
              <>
                <bdi
                  className={cn(
                    // Capped only to leave room for a detail; alone, the line takes the row.
                    line.detail ? 'max-w-[55%] shrink-0' : 'min-w-0 flex-1',
                    'truncate',
                    item.resolved ? 'text-muted-foreground line-through' : 'font-medium',
                  )}
                >
                  {line.main}
                </bdi>
                {line.detail ? <bdi className="min-w-0 flex-1 truncate text-end text-muted-foreground">{line.detail}</bdi> : null}
              </>
            );
            const itemClass = 'flex min-h-7 items-center gap-2 rounded-lg px-1.5 text-[0.78125rem]';
            return (
              <li key={item.id}>
                {itemHref ? (
                  <Link
                    href={itemHref}
                    onClick={onNavigate}
                    className={cn(itemClass, 'hover:bg-card/70 focus-visible:outline-3 focus-visible:outline-ring/55')}
                  >
                    {inner}
                  </Link>
                ) : (
                  <span className={itemClass}>{inner}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
