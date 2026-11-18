import { NOTIFICATION_TYPES, type NotificationTypeDefinition } from '@school-erp/shared';
import {
  effectiveEnabled,
  groupLockKey,
  isLocked,
  retentionCutoffs,
  schoolDefaultOf,
  toNotificationView,
  type StoredItem,
  type StoredNotification,
} from './notifications.pure';

const APPROVAL = NOTIFICATION_TYPES['hr.penalty.awaiting_approval'];
const REMINDER = NOTIFICATION_TYPES['hr.contract.ending_soon'];

const T0 = new Date('2026-11-18T08:00:00Z');
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const item = (id: string, overrides: Partial<StoredItem> = {}): StoredItem => ({
  id,
  type: 'hr.penalty.awaiting_approval',
  entityType: 'penalty',
  entityId: `p-${id}`,
  employeeId: `e-${id}`,
  params: { employee: { en: `Omar ${id}`, ar: `عمر ${id}` }, level: 1 },
  createdAt: T0,
  resolvedAt: null,
  resolvedByName: null,
  resolution: null,
  ...overrides,
});

const row = (
  items: StoredItem[],
  overrides: Partial<StoredNotification> = {},
): StoredNotification => ({
  id: 'n-1',
  type: 'hr.penalty.awaiting_approval',
  createdAt: T0,
  updatedAt: later(5),
  readAt: null,
  resolvedAt: null,
  items,
  ...overrides,
});

describe('preferences (N13)', () => {
  it('a type that can’t be turned off is always on in the app, whatever the school or the person chose', () => {
    expect(effectiveEnabled(APPROVAL, 'in_app', false, false)).toBe(true);
    expect(schoolDefaultOf(APPROVAL, 'in_app', false)).toBe(true);
    expect(isLocked(APPROVAL, 'in_app')).toBe(true);
    expect(isLocked(REMINDER, 'in_app')).toBe(false);
  });

  it('otherwise: the person’s choice, else the school’s default, else the type’s own default (edge cases 18, 19)', () => {
    expect(effectiveEnabled(REMINDER, 'in_app', undefined, undefined)).toBe(true);
    expect(effectiveEnabled(REMINDER, 'in_app', false, undefined)).toBe(false);
    expect(effectiveEnabled(REMINDER, 'in_app', false, true)).toBe(true);
    expect(effectiveEnabled(REMINDER, 'in_app', true, false)).toBe(false);
    const offByDefault: NotificationTypeDefinition = { ...REMINDER, defaultChannels: [] };
    expect(effectiveEnabled(offByDefault, 'in_app', undefined, undefined)).toBe(false);
  });
});

describe('retention (N14, edge case 22)', () => {
  it('cuts at read − 90 days, resolved − 30 days, created − 365 days', () => {
    const c = retentionCutoffs(new Date('2026-11-18T00:00:00Z'), {
      readDays: 90,
      resolvedDays: 30,
      maxDays: 365,
    });
    expect(c.readBefore.toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(c.resolvedBefore.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(c.createdBefore.toISOString()).toBe('2025-11-18T00:00:00.000Z');
  });
});

describe('what the reader gets (N11, N17)', () => {
  it('one item reads as itself: its values, its link, count 1', () => {
    const view = toNotificationView(row([item('a')]), APPROVAL, new Set(['a']));
    expect(view).toMatchObject({
      id: 'n-1',
      module: 'hr',
      category: 'approval',
      params: { employee: { en: 'Omar a', ar: 'عمر a' }, level: 1, count: 1 },
      link: { screen: 'penalties', query: { penalty: 'p-a' } },
      openCount: 1,
      resolved: null,
      readAt: null,
    });
    expect(view?.items).toHaveLength(1);
  });

  it('a group lists its items newest first, opens into them (no link of its own) and counts the open ones (edge 28)', () => {
    const view = toNotificationView(
      row([
        item('a'),
        item('b', {
          createdAt: later(2),
          resolvedAt: later(3),
          resolution: 'approved',
          resolvedByName: { en: 'Laila', ar: 'ليلى' },
        }),
        item('c', { createdAt: later(4) }),
      ]),
      APPROVAL,
      new Set(['a', 'b', 'c']),
    );
    expect(view?.items.map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(view?.link).toBeNull();
    expect(view?.params.count).toBe(3);
    expect(view?.openCount).toBe(2);
    expect(view?.items[1]?.resolved).toEqual({
      at: later(3).toISOString(),
      by: { en: 'Laila', ar: 'ليلى' },
      resolution: 'approved',
    });
  });

  it('items the reader may no longer see are left out of items, count and openCount; none left → null (edges 19, 27)', () => {
    const r = row([item('a'), item('b'), item('c')]);
    const view = toNotificationView(r, APPROVAL, new Set(['b']));
    expect(view?.items.map((i) => i.id)).toEqual(['b']);
    expect(view?.params.count).toBe(1);
    expect(view?.openCount).toBe(1);
    expect(view?.link).toEqual({ screen: 'penalties', query: { penalty: 'p-b' } });
    expect(toNotificationView(r, APPROVAL, new Set())).toBeNull();
  });

  it('a resolved single item reads "Approved by …"; a resolved group "done" with no one person', () => {
    const at = later(9);
    const single = toNotificationView(
      row(
        [
          item('a', {
            resolvedAt: at,
            resolution: 'cancelled',
            resolvedByName: { en: 'Laila', ar: 'ليلى' },
          }),
        ],
        { resolvedAt: at },
      ),
      APPROVAL,
      new Set(['a']),
    );
    expect(single?.resolved).toEqual({
      at: at.toISOString(),
      by: { en: 'Laila', ar: 'ليلى' },
      resolution: 'cancelled',
    });
    const group = toNotificationView(
      row(
        [
          item('a', { resolvedAt: at, resolution: 'approved' }),
          item('b', { resolvedAt: at, resolution: 'approved' }),
        ],
        {
          resolvedAt: at,
        },
      ),
      APPROVAL,
      new Set(['a', 'b']),
    );
    expect(group?.resolved).toEqual({ at: at.toISOString(), by: null, resolution: 'done' });
    expect(group?.openCount).toBe(0);
  });

  it('the group lock key names the recipient, the type and the group', () => {
    expect(groupLockKey('user', 'u-1', 'hr.contract.ending_soon', '2027-05-01')).toBe(
      'notification:user:u-1:hr.contract.ending_soon:2027-05-01',
    );
  });
});
