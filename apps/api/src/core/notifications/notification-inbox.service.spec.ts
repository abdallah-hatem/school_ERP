import { NotificationAccess } from './notification-access.service';
import { NotificationInbox } from './notification-inbox.service';
import { NotificationTypes } from './notification-types';
import type { StoredNotification } from './notifications.pure';
import type {
  NotificationsRepository,
  ReaderFilter,
} from './repositories/notifications.repository';

/*
 * The Unread tab lists exactly what the bell counts (live N5 check, 2026-11-19): it listed done
 * notifications nobody had read too (15 rows against a badge of 4). The repository is faked with
 * the same `open` rule its query applies (unread and unresolved); the access check lets through
 * every item but those named hidden.
 */

const ME = { id: 'u-1' };
const TYPE = 'hr.penalty.awaiting_approval';
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 19, 8, minutes));

function stored(
  id: string,
  opts: { read?: boolean; resolved?: boolean; items?: { id: string; resolved?: boolean }[] } = {},
): StoredNotification {
  const items = opts.items ?? [{ id: `${id}-1`, resolved: opts.resolved }];
  return {
    id,
    type: TYPE,
    createdAt: at(0),
    updatedAt: at(0),
    readAt: opts.read ? at(5) : null,
    resolvedAt: opts.resolved ? at(10) : null,
    items: items.map((i) => ({
      id: i.id,
      type: TYPE,
      entityType: 'penalty',
      entityId: `p-${i.id}`,
      employeeId: 'e-1',
      params: {},
      createdAt: at(0),
      resolvedAt: i.resolved ? at(10) : null,
      resolvedByName: null,
      resolution: i.resolved ? 'approved' : null,
    })),
  };
}

function make(rows: StoredNotification[], hidden: string[] = []) {
  const repository = {
    findForReader: jest.fn((_to: unknown, filter: ReaderFilter = {}) =>
      Promise.resolve(rows.filter((r) => !filter.open || (!r.readAt && !r.resolvedAt))),
    ),
  };
  const access = {
    visibleItems: jest.fn((_who: unknown, list: readonly StoredNotification[]) =>
      Promise.resolve(
        new Set(list.flatMap((r) => r.items.map((i) => i.id)).filter((i) => !hidden.includes(i))),
      ),
    ),
  };
  const inbox = new NotificationInbox(
    repository as unknown as NotificationsRepository,
    access as unknown as NotificationAccess,
    new NotificationTypes(),
  );
  return { inbox, repository };
}

const page = { page: 1, limit: 20 } as const;

describe('NotificationInbox: the Unread tab is the bell count', () => {
  const rows = [
    stored('open'),
    stored('open-read', { read: true }),
    stored('done-unread', { resolved: true }),
    stored('done-read', { read: true, resolved: true }),
    // A group with one of its two penalties approved: still waiting, still counted.
    stored('half-done', { items: [{ id: 'h1', resolved: true }, { id: 'h2' }] }),
    // An open item the reader may no longer see (their stage moved), next to a done one they may.
    stored('hidden-open', { items: [{ id: 'x1' }, { id: 'x2', resolved: true }] }),
  ];

  it('lists exactly the notifications the badge counts, and the same number', async () => {
    const { inbox } = make(rows, ['x1']);
    const { count } = await inbox.unreadCount(ME);
    const unread = await inbox.list(ME, { ...page, status: 'unread' });
    expect(unread.data.map((n) => n.id)).toEqual(['open', 'half-done']);
    expect(unread.total).toBe(count);
    expect(count).toBe(2);
  });

  it('a done notification nobody read is in All, not in Unread', async () => {
    const { inbox } = make(rows, ['x1']);
    const all = await inbox.list(ME, { ...page, status: 'all' });
    expect(all.data.map((n) => n.id)).toContain('done-unread');
    const unread = await inbox.list(ME, { ...page, status: 'unread' });
    expect(unread.data.map((n) => n.id)).not.toContain('done-unread');
  });

  it('All keeps everything the reader may see, read or done', async () => {
    const { inbox, repository } = make(rows, ['x1']);
    const all = await inbox.list(ME, { ...page, status: 'all' });
    expect(all.total).toBe(6);
    expect(repository.findForReader).toHaveBeenLastCalledWith(
      { kind: 'user', id: 'u-1' },
      { open: false, types: undefined },
    );
  });

  it('pages after the filter: total and hasNextPage count only what Unread shows', async () => {
    const many = Array.from({ length: 5 }, (_, i) => stored(`n${i}`)).concat(
      Array.from({ length: 4 }, (_, i) => stored(`d${i}`, { resolved: true })),
    );
    const { inbox } = make(many);
    const first = await inbox.list(ME, { page: 1, limit: 3, status: 'unread' });
    expect(first.total).toBe(5);
    expect(first.hasNextPage).toBe(true);
    const second = await inbox.list(ME, { page: 2, limit: 3, status: 'unread' });
    expect(second.data).toHaveLength(2);
    expect(second.hasNextPage).toBe(false);
  });
});
