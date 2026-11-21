import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  NotificationCategory,
  NotificationItem,
  NotificationsReadAll,
  NotificationUnreadCount,
  Paginated,
} from '@school-erp/shared';
import { NotificationAccess } from './notification-access.service';
import { NotificationTypes } from './notification-types';
import { toNotificationView, type StoredNotification } from './notifications.pure';
import { NotificationsRepository, type Recipient } from './repositories/notifications.repository';

type Who = { id: string };

export interface InboxQuery {
  page: number;
  limit: number;
  status: 'all' | 'unread';
  category?: NotificationCategory;
}

const me = (user: Who): Recipient => ({ kind: 'user', id: user.id });

/**
 * What the bell counts and the Unread tab lists — one rule for both: unread, unresolved (the
 * query's `open`), with at least one open item the reader may still see.
 */
const countsInBell = (view: NotificationItem): boolean => view.openCount > 0;

/**
 * The bell (spec → Reading): a person's own notifications only — the recipient is always the
 * signed-in user, never a parameter; another person's id answers 404. Every read re-checks each
 * item against the reader's current permission and scope (N11): an item they may no longer see is
 * left out of the list and the count (the row stays), and a notification with none left is absent.
 *
 * Read state is personal, not school data: none of these writes is audited (spec, §9).
 */
@Injectable()
export class NotificationInbox {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly access: NotificationAccess,
    private readonly types: NotificationTypes,
  ) {}

  /**
   * Newest first (by latest item), paged. The access re-check needs every candidate row, so the
   * page is cut after it — fine for a school's numbers (a person's notifications are purged after
   * 90 / 30 / 365 days, N14).
   */
  async list(user: Who, query: InboxQuery): Promise<Paginated<NotificationItem>> {
    const unread = query.status === 'unread';
    const rows = await this.notifications.findForReader(me(user), {
      // Unread is exactly what the bell counts (`unreadCount`): a done one, unread or not, isn't.
      open: unread,
      types: query.category ? this.typesOf(query.category) : undefined,
    });
    const visible = await this.visible(user, rows);
    const views = unread ? visible.filter(countsInBell) : visible;
    const total = views.length;
    const start = (query.page - 1) * query.limit;
    return {
      data: views.slice(start, start + query.limit),
      total,
      page: query.page,
      limit: query.limit,
      hasNextPage: start + query.limit < total,
      hasPreviousPage: query.page > 1,
    };
  }

  /**
   * Unread, unresolved notifications with at least one open item the reader may still see. The
   * real number: the bell shows "99+" above 99.
   */
  async unreadCount(user: Who): Promise<NotificationUnreadCount> {
    const rows = await this.notifications.findForReader(me(user), { open: true });
    const views = await this.visible(user, rows);
    return { count: views.filter(countsInBell).length };
  }

  async markRead(user: Who, id: string): Promise<NotificationItem> {
    const row = await this.ownVisible(user, id);
    if (!row.readAt) await this.notifications.setReadAt(id, new Date());
    return this.view(user, id);
  }

  async markUnread(user: Who, id: string): Promise<NotificationItem> {
    const row = await this.ownVisible(user, id);
    if (row.readAt) await this.notifications.setReadAt(id, null);
    return this.view(user, id);
  }

  /**
   * Marks read every unread notification whose latest item came at or before `upTo` — the moment
   * the list was loaded — so one that arrives (or grows) meanwhile stays unread (edge case 13).
   */
  async readAll(user: Who, upTo: Date): Promise<NotificationsReadAll> {
    return { updated: await this.notifications.readAllUpTo(me(user), upTo, new Date()) };
  }

  /**
   * One of the person's notifications as the bell shows it to them now (N11) — only the items they
   * may still see — or null when it isn't theirs or they may see none of it. The push alert reads it.
   */
  async findVisible(user: Who, id: string): Promise<NotificationItem | null> {
    const row = await this.notifications.findOne(me(user), id);
    const [view] = row ? await this.visible(user, [row]) : [];
    return view ?? null;
  }

  private typesOf(category: NotificationCategory): string[] {
    return this.types
      .all()
      .filter(([, t]) => t.category === category)
      .map(([key]) => key);
  }

  private async visible(
    user: Who,
    rows: readonly StoredNotification[],
  ): Promise<NotificationItem[]> {
    const ids = await this.access.visibleItems(user, rows);
    return rows.flatMap((row) => {
      const type = this.types.find(row.type);
      const view = type ? toNotificationView(row, type, ids) : null;
      return view ? [view] : [];
    });
  }

  /** The reader's own notification with at least one item they may still see; otherwise 404. */
  private async ownVisible(user: Who, id: string): Promise<StoredNotification> {
    const row = await this.notifications.findOne(me(user), id);
    if (!row || (await this.visible(user, [row])).length === 0) throw new NotFoundException();
    return row;
  }

  private async view(user: Who, id: string): Promise<NotificationItem> {
    const row = await this.notifications.findOne(me(user), id);
    const [view] = row ? await this.visible(user, [row]) : [];
    if (!view) throw new NotFoundException();
    return view;
  }
}
