'use client';

import { NOTIFICATION_BELL_MAX, type IsoDateTime, type NotificationItem } from '@school-erp/shared';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { callApi } from '@/lib/callApi';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '@/shared/components/ui/sheet';
import { NotificationsIcon } from '@/shared/components/ui/icons';
import { TABLET_UP, useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  GET_NOTIFICATIONS,
  GET_UNREAD_NOTIFICATIONS_COUNT,
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATION_READ,
} from '../apis';
import { badgeText } from '../lib/text';
import { NotificationsI18n } from '../messages';
import { NotificationPanel, type InboxStatus } from './notification-panel';

/** How often the count is asked for while the tab is visible (spec N12, GUESS). */
export const BELL_POLL_MS = 60_000;

/**
 * The bell beside the language switch (option A): the unread count, polled every minute while the
 * tab is visible and again whenever it comes back into view; a click opens the list — anchored to
 * the bell on a tablet or desktop, the whole screen on a phone (< 768px). Esc, ✕ or following a
 * link closes it and focus returns to the bell.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { locale } = useTranslation();
  return (
    <NotificationsI18n locale={locale}>
      <Bell className={className} />
    </NotificationsI18n>
  );
}

type Inbox = ReturnType<typeof useInbox>;
const InboxContext = createContext<Inbox | null>(null);

/**
 * The bell's data, once for the whole shell: the phone top bar and the desktop row each draw a
 * bell (CSS shows one), and both read this — one poll, one count.
 */
export function NotificationInbox({ children }: { children: ReactNode }) {
  const inbox = useInbox();
  return <InboxContext.Provider value={inbox}>{children}</InboxContext.Provider>;
}

function Bell({ className }: { className?: string }) {
  const { t, locale } = useTranslation();
  const wide = useMediaQuery(TABLET_UP, true);
  const [open, setOpenState] = useState(false);
  const inbox = useContext(InboxContext);
  if (!inbox) throw new Error('NotificationBell must be inside <NotificationInbox>');
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) inbox.reload(inbox.status);
  };
  const count = inbox.count;
  const label =
    count > 0
      ? `${t('notifications.bell.label')}${locale === 'ar' ? '، ' : ', '}${t('notifications.bell.unread', { count })}`
      : t('notifications.bell.label');

  const trigger = (
    <button
      type="button"
      aria-label={label}
      data-testid="notification-bell"
      className={cn(
        'tap-target relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border text-xl transition-colors duration-150 md:size-10.5 md:rounded-[0.8125rem]',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
        open ? 'border-transparent bg-primary-soft text-primary' : 'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
    >
      <NotificationsIcon className="size-5.5" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          data-testid="notification-badge"
          className="tabular absolute -end-1.75 -top-1.5 grid h-5.25 min-w-5.25 place-items-center rounded-full bg-accent px-1.5 text-[0.6875rem] font-extrabold text-accent-foreground shadow-[0_0_0_2px_var(--background)]"
        >
          {badgeText(count, NOTIFICATION_BELL_MAX)}
        </span>
      ) : null}
    </button>
  );

  const panel = (variant: 'popover' | 'sheet') => (
    <NotificationPanel
      variant={variant}
      status={inbox.status}
      onStatus={inbox.setStatus}
      items={inbox.items}
      total={inbox.total}
      failed={inbox.failed}
      retrying={inbox.retrying}
      onRetry={inbox.retry}
      unreadCount={count}
      markingAll={inbox.markingAll}
      onMarkAll={() => void inbox.markAll()}
      onOpen={(n) => void inbox.markRead(n)}
      onClose={() => setOpen(false)}
      now={inbox.now}
      settingsHref={`/${locale}/account/notifications`}
    />
  );

  if (!wide) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="full" label={t('notifications.title')} className="gap-0 border-0">
          {panel('sheet')}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        aria-label={t('notifications.title')}
        className="w-[26.875rem] rounded-3xl p-0"
      >
        {panel('popover')}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The bell's data: the unread count (polled, refreshed on focus) and, while the list is open, its
 * first page for the chosen tab. Opening a notification marks it read at once on screen; "Mark all
 * as read" sends the newest time the list showed (`upTo`), so one that arrives meanwhile stays
 * unread, and a second click while it runs sends nothing.
 */
function useInbox() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<InboxStatus>('all');
  const [items, setItems] = useState<NotificationItem[] | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [now, setNow] = useState<IsoDateTime>(() => new Date().toISOString());
  const markingRef = useRef(false);
  const loadSeq = useRef(0);

  const refreshCount = useCallback(async () => {
    const res = await callApi(GET_UNREAD_NOTIFICATIONS_COUNT(), { showErrorToast: false });
    if (res.success && res.data) setCount(res.data.count);
  }, []);

  // The count: now, every minute while the tab is visible, and when the tab comes back.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshCount();
    };
    tick();
    const timer = window.setInterval(tick, BELL_POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refreshCount]);

  const load = useCallback(async (which: InboxStatus) => {
    const seq = ++loadSeq.current;
    const res = await callApi(GET_NOTIFICATIONS({ status: which }), { showErrorToast: false });
    if (seq !== loadSeq.current) return;
    setRetrying(false);
    if (res.unauthorized) return;
    if (res.success) {
      setItems(res.data ?? []);
      setTotal(res.meta?.total ?? res.data?.length ?? 0);
      setFailed(false);
      setNow(new Date().toISOString());
    } else {
      setFailed(true);
    }
  }, []);

  /** Opening the list (or switching its tab) loads its first page, and the count again. */
  const reload = useCallback(
    (which: InboxStatus) => {
      setItems(undefined);
      setFailed(false);
      void load(which);
      void refreshCount();
    },
    [load, refreshCount],
  );
  const changeStatus = useCallback(
    (which: InboxStatus) => {
      setStatus(which);
      reload(which);
    },
    [reload],
  );

  const markRead = useCallback(
    async (n: NotificationItem) => {
      if (n.readAt) return;
      const at = new Date().toISOString();
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, readAt: at } : x)));
      // A resolved one no longer counts (N10), so only an open one lowers the number.
      if (!n.resolved) setCount((c) => Math.max(0, c - 1));
      const res = await callApi(MARK_NOTIFICATION_READ(n.id), { showErrorToast: false });
      if (!res.success) void refreshCount();
    },
    [refreshCount],
  );

  const markAll = useCallback(async () => {
    const upTo = items?.[0]?.updatedAt;
    if (markingRef.current || !upTo) return;
    markingRef.current = true;
    setMarkingAll(true);
    try {
      const res = await callApi(MARK_ALL_NOTIFICATIONS_READ(upTo));
      if (res.success) {
        const at = new Date().toISOString();
        setItems((list) => list?.map((x) => (x.readAt || x.updatedAt > upTo ? x : { ...x, readAt: at })));
      }
      await refreshCount();
    } finally {
      markingRef.current = false;
      setMarkingAll(false);
    }
  }, [items, refreshCount]);

  const retry = useCallback(() => {
    setRetrying(true);
    void load(status);
  }, [load, status]);

  return { count, status, setStatus: changeStatus, reload, items, total, failed, retrying, retry, markingAll, markAll, markRead, now };
}
