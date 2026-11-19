// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationItem } from '@school-erp/shared';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_NOTIFICATIONS: vi.fn(),
  GET_UNREAD_NOTIFICATIONS_COUNT: vi.fn(),
  MARK_NOTIFICATION_READ: vi.fn(),
  MARK_NOTIFICATION_UNREAD: vi.fn(),
  MARK_ALL_NOTIFICATIONS_READ: vi.fn(),
}));
vi.mock('../apis', () => api);
vi.mock('next/navigation', () => ({ redirect: vi.fn(), usePathname: () => '/en' }));
vi.mock('next/link', () => ({
  default: ({ children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a
      {...props}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
    >
      {children}
    </a>
  ),
}));

import { renderWithI18n } from '@/test/render';
import { BELL_POLL_MS, NotificationBell as Bell, NotificationInbox } from './notification-bell';

/** The shell's two bells (phone bar, desktop row) share one inbox; one is enough here. */
function NotificationBell() {
  return (
    <NotificationInbox>
      <Bell />
    </NotificationInbox>
  );
}

const ok = <T,>(data: T, meta?: { total: number; page: number; limit: number }) =>
  Promise.resolve({ success: true as const, status: 200, data, meta });

const NOW = new Date().toISOString();
const omar = { en: 'Omar Khalil', ar: 'عمر خليل' };
const late = { en: 'Late to class', ar: 'التأخر عن الحصة' };

function penalty(id: string, extra: Partial<NotificationItem> = {}): NotificationItem {
  const params = { employee: omar, violation: late, level: 1 };
  const link = { screen: 'penalties' as const, query: { penalty: `p-${id}` } };
  return {
    id,
    type: 'hr.penalty.awaiting_approval',
    module: 'hr',
    category: 'approval',
    params: { ...params, count: 1 },
    link,
    items: [{ id: `item-${id}`, params, link, resolved: null }],
    openCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    readAt: null,
    resolved: null,
    ...extra,
  };
}

const bell = () => screen.getByTestId('notification-bell');

describe('the bell (option A)', () => {
  beforeEach(() => {
    api.GET_UNREAD_NOTIFICATIONS_COUNT.mockImplementation(() => ok({ count: 2 }));
    api.GET_NOTIFICATIONS.mockImplementation(() => ok([penalty('a'), penalty('b', { readAt: NOW })], { total: 2, page: 1, limit: 20 }));
    api.MARK_NOTIFICATION_READ.mockImplementation(() => ok(penalty('a', { readAt: NOW })));
    api.MARK_ALL_NOTIFICATIONS_READ.mockImplementation(() => ok({ updated: 1 }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('shows the unread count, and 99+ past 99 (the API sends the real number)', async () => {
    api.GET_UNREAD_NOTIFICATIONS_COUNT.mockImplementation(() => ok({ count: 1284 }));
    renderWithI18n(<NotificationBell />);
    expect(await screen.findByTestId('notification-badge')).toHaveProperty('textContent', '99+');
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1284 unread notifications');
  });

  it('no badge with nothing unread; Arabic reads the count in words', async () => {
    api.GET_UNREAD_NOTIFICATIONS_COUNT.mockImplementation(() => ok({ count: 0 }));
    renderWithI18n(<NotificationBell />);
    await waitFor(() => expect(api.GET_UNREAD_NOTIFICATIONS_COUNT).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-badge')).toBeNull();
    cleanup();
    api.GET_UNREAD_NOTIFICATIONS_COUNT.mockImplementation(() => ok({ count: 2 }));
    renderWithI18n(<NotificationBell />, { locale: 'ar' });
    await screen.findByTestId('notification-badge');
    expect(bell().getAttribute('aria-label')).toBe('الإشعارات، إشعاران غير مقروءين');
  });

  it('the shell’s two bells (phone bar, desktop row) share one count: one request, not two', async () => {
    renderWithI18n(
      <NotificationInbox>
        <Bell />
        <Bell />
      </NotificationInbox>,
    );
    await waitFor(() => expect(screen.getAllByTestId('notification-badge')).toHaveLength(2));
    expect(api.GET_UNREAD_NOTIFICATIONS_COUNT).toHaveBeenCalledTimes(1);
  });

  it('asks again every minute while visible and when the tab gets focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithI18n(<NotificationBell />);
    await waitFor(() => expect(api.GET_UNREAD_NOTIFICATIONS_COUNT).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(BELL_POLL_MS);
    });
    expect(api.GET_UNREAD_NOTIFICATIONS_COUNT).toHaveBeenCalledTimes(2);
    act(() => {
      fireEvent.focus(window);
    });
    expect(api.GET_UNREAD_NOTIFICATIONS_COUNT).toHaveBeenCalledTimes(3);
  });

  it('opening a notification marks it read, lowers the count and follows its link; the list closes', async () => {
    const user = userEvent.setup();
    renderWithI18n(<NotificationBell />);
    await screen.findByTestId('notification-badge');
    await user.click(bell());
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    const rows = await within(dialog).findAllByTestId('notification-row');
    expect(rows).toHaveLength(2);
    const link = within(rows[0]!).getByRole('link');
    expect(link.getAttribute('href')).toBe('/en/penalties?penalty=p-a');
    await user.click(link);
    expect(api.MARK_NOTIFICATION_READ).toHaveBeenCalledWith('a');
    expect(screen.getByTestId('notification-badge').textContent).toBe('1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Mark all as read" sends the newest time the list showed, once, however often it is clicked', async () => {
    const user = userEvent.setup();
    let finish: (v: unknown) => void = () => {};
    api.MARK_ALL_NOTIFICATIONS_READ.mockImplementation(
      () => new Promise((r) => (finish = () => r({ success: true, status: 200, data: { updated: 1 } }))),
    );
    renderWithI18n(<NotificationBell />);
    await user.click(bell());
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByTestId('notification-row');
    const button = within(dialog).getByRole('button', { name: 'Mark all as read' });
    await user.click(button);
    await user.click(button);
    expect(api.MARK_ALL_NOTIFICATIONS_READ).toHaveBeenCalledTimes(1);
    expect(api.MARK_ALL_NOTIFICATIONS_READ).toHaveBeenCalledWith(NOW);
    await act(async () => finish(undefined));
  });

  it('a group opens into its items first, each with its own link', async () => {
    const user = userEvent.setup();
    const group = penalty('g');
    group.items = [
      { ...group.items[0]!, id: 'i1', link: { screen: 'penalties', query: { penalty: 'p-1' } } },
      { ...group.items[0]!, id: 'i2', params: { employee: { en: 'Salma Nabil', ar: 'سلمى نبيل' }, violation: late, level: 2 }, link: { screen: 'penalties', query: { penalty: 'p-2' } } },
    ];
    group.link = null;
    group.openCount = 2;
    api.GET_NOTIFICATIONS.mockImplementation(() => ok([group], { total: 1, page: 1, limit: 20 }));
    renderWithI18n(<NotificationBell />);
    await user.click(bell());
    const row = (await screen.findAllByTestId('notification-row'))[0]!;
    const toggle = within(row).getByRole('button', { name: /2 penalties waiting for your approval/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(api.MARK_NOTIFICATION_READ).toHaveBeenCalledWith('g');
    expect(within(row).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/en/penalties?penalty=p-1',
      '/en/penalties?penalty=p-2',
    ]);
  });

  it('empty: "You\'re all caught up"; Unread with none: its own message', async () => {
    const user = userEvent.setup();
    api.GET_NOTIFICATIONS.mockImplementation(() => ok([], { total: 0, page: 1, limit: 20 }));
    renderWithI18n(<NotificationBell />);
    await user.click(bell());
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Mark all as read' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('tab', { name: /Unread/ }));
    expect(await screen.findByText('Everything here has been read.')).toBeTruthy();
    expect(api.GET_NOTIFICATIONS).toHaveBeenLastCalledWith({ status: 'unread' });
  });

  it('a failed load says so and retries', async () => {
    const user = userEvent.setup();
    api.GET_NOTIFICATIONS.mockImplementationOnce(() => Promise.resolve({ success: false, status: 500, message: 'x' }));
    renderWithI18n(<NotificationBell />);
    await user.click(bell());
    expect(await screen.findByText("Notifications couldn't load.")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId('notification-row')).toHaveLength(2);
  });
});

/*
 * Unread lists what the bell counts (live N5 check): the API's `status=unread` holds only
 * notifications with an open item, and the open list follows a read at once instead of keeping
 * the rows until the next reload.
 */
describe('the Unread tab follows the bell', () => {
  /** A fake inbox: `unread` lists what the count counts (unread, with an open item). */
  function serve(rows: NotificationItem[]) {
    const state = rows.map((r) => ({ ...r }));
    const counted = () => state.filter((r) => !r.readAt && r.openCount > 0);
    api.GET_UNREAD_NOTIFICATIONS_COUNT.mockImplementation(() => ok({ count: counted().length }));
    api.GET_NOTIFICATIONS.mockImplementation(({ status }: { status: 'all' | 'unread' }) => {
      const list = status === 'unread' ? counted() : state;
      return ok(list.map((r) => ({ ...r })), { total: list.length, page: 1, limit: 20 });
    });
    api.MARK_ALL_NOTIFICATIONS_READ.mockImplementation(() => {
      for (const r of state) r.readAt ??= NOW;
      return ok({ updated: state.length });
    });
    api.MARK_NOTIFICATION_READ.mockImplementation((id: string) => {
      const row = state.find((r) => r.id === id);
      if (row) row.readAt = NOW;
      return ok(row);
    });
  }
  const done = { at: NOW, by: { en: 'Laila Hassan', ar: 'ليلى حسن' }, resolution: 'approved' as const };
  const resolvedPenalty = (id: string) => {
    const n = penalty(id, { openCount: 0, resolved: done });
    n.items = n.items.map((i) => ({ ...i, resolved: done }));
    return n;
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows as many rows as the badge counts — a done one nobody read is in All only', async () => {
    const user = userEvent.setup();
    serve([penalty('a'), penalty('b'), resolvedPenalty('c')]);
    renderWithI18n(<NotificationBell />);
    expect((await screen.findByTestId('notification-badge')).textContent).toBe('2');
    await user.click(bell());
    expect(await screen.findAllByTestId('notification-row')).toHaveLength(3);
    await user.click(screen.getByRole('tab', { name: /Unread/ }));
    await waitFor(() => expect(api.GET_NOTIFICATIONS).toHaveBeenLastCalledWith({ status: 'unread' }));
    await waitFor(() => expect(screen.getAllByTestId('notification-row')).toHaveLength(2));
  });

  it('"Mark all as read" on Unread empties the open list at once, and the badge', async () => {
    const user = userEvent.setup();
    serve([penalty('a'), penalty('b')]);
    renderWithI18n(<NotificationBell />);
    await screen.findByTestId('notification-badge');
    await user.click(bell());
    await screen.findAllByTestId('notification-row');
    await user.click(screen.getByRole('tab', { name: /Unread/ }));
    await waitFor(() => expect(screen.getAllByTestId('notification-row')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByText('Everything here has been read.')).toBeTruthy();
    expect(screen.queryAllByTestId('notification-row')).toHaveLength(0);
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('"Mark all as read" on All keeps the rows, now read', async () => {
    const user = userEvent.setup();
    serve([penalty('a'), penalty('b')]);
    renderWithI18n(<NotificationBell />);
    await screen.findByTestId('notification-badge');
    await user.click(bell());
    await screen.findAllByTestId('notification-row');
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(screen.queryByTestId('notification-badge')).toBeNull());
    expect(screen.getAllByTestId('notification-row')).toHaveLength(2);
    expect(screen.queryAllByRole('img', { name: 'Unread' })).toHaveLength(0);
  });

  it('marking one read on Unread takes it out of the list; a group being opened stays until the next load', async () => {
    const user = userEvent.setup();
    const single = penalty('s', { link: null });
    single.items = single.items.map((i) => ({ ...i, link: null }));
    const group = penalty('g', { link: null, openCount: 2 });
    group.items = [
      { ...group.items[0]!, id: 'g1' },
      { ...group.items[0]!, id: 'g2', params: { employee: { en: 'Salma Nabil', ar: 'سلمى نبيل' }, violation: late, level: 2 } },
    ];
    serve([single, group]);
    renderWithI18n(<NotificationBell />);
    await screen.findByTestId('notification-badge');
    await user.click(bell());
    await screen.findAllByTestId('notification-row');
    await user.click(screen.getByRole('tab', { name: /Unread/ }));
    await waitFor(() => expect(screen.getAllByTestId('notification-row')).toHaveLength(2));

    // The group: opened, read, still there with its items.
    const toggle = screen.getByRole('button', { name: /2 penalties waiting for your approval/ });
    await user.click(toggle);
    await waitFor(() => expect(api.GET_NOTIFICATIONS).toHaveBeenCalledTimes(3));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Salma Nabil')).toBeTruthy();
    expect(screen.getByTestId('notification-badge').textContent).toBe('1');

    // The single one (no link): read, and gone from Unread — as is the group, now read.
    await user.click(screen.getByRole('button', { name: /^Penalty waiting for your approval/ }));
    await waitFor(() => expect(screen.queryAllByTestId('notification-row')).toHaveLength(0));
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });
});
