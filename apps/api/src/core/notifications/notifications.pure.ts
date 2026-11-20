import {
  NOTIFICATION_RESOLUTIONS,
  type NotificationChannel,
  type NotificationItem,
  type NotificationItemEntry,
  type NotificationName,
  type NotificationResolution,
  type NotificationResolved,
  type NotificationRetention,
  type NotificationSubject,
  type NotificationTypeDefinition,
} from '@school-erp/shared';

/*
 * Pure rules of core/notifications: rows in, values out — no database, no request.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a type reaches a person on a channel (N13): a type that can't be turned off is always on
 * in the app; otherwise the person's own choice, else the school's default, else the type's own.
 */
export function effectiveEnabled(
  type: Pick<NotificationTypeDefinition, 'canTurnOff' | 'defaultChannels'>,
  channel: NotificationChannel,
  schoolDefault: boolean | undefined,
  personal: boolean | undefined,
): boolean {
  if (isLocked(type, channel)) return true;
  return personal ?? schoolDefaultOf(type, channel, schoolDefault);
}

/** The school's default for a type and channel: its row, else the type's own default. */
export function schoolDefaultOf(
  type: Pick<NotificationTypeDefinition, 'canTurnOff' | 'defaultChannels'>,
  channel: NotificationChannel,
  stored: boolean | undefined,
): boolean {
  if (isLocked(type, channel)) return true;
  return stored ?? type.defaultChannels.includes(channel);
}

/** A type that can't be turned off is locked on in the app; other channels stay optional (spec). */
export function isLocked(
  type: Pick<NotificationTypeDefinition, 'canTurnOff'>,
  channel: NotificationChannel,
): boolean {
  return !type.canTurnOff && channel === 'in_app';
}

/** The instants before which the nightly purge deletes (N14): read, resolved, and any notification. */
export function retentionCutoffs(
  now: Date,
  retention: NotificationRetention,
): { readBefore: Date; resolvedBefore: Date; createdBefore: Date } {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return {
    readBefore: ago(retention.readDays),
    resolvedBefore: ago(retention.resolvedDays),
    createdBefore: ago(retention.maxDays),
  };
}

/** The advisory-lock key that serialises one recipient's group of one type (N17). */
export function groupLockKey(
  recipientKind: string,
  recipientId: string,
  type: string,
  groupKey: string,
): string {
  return `notification:${recipientKind}:${recipientId}:${type}:${groupKey}`;
}

/** A notification item as read from the table. */
export interface StoredItem {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  employeeId: string | null;
  params: unknown;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByName: unknown;
  resolution: string | null;
}

/** A notification as read from the table, with its items. */
export interface StoredNotification {
  id: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
  items: StoredItem[];
}

export function subjectOf(
  item: Pick<StoredItem, 'entityType' | 'entityId' | 'employeeId'>,
): NotificationSubject {
  return { entityType: item.entityType, entityId: item.entityId, employeeId: item.employeeId };
}

function paramsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function nameOf(value: unknown): NotificationName | null {
  if (!value || typeof value !== 'object') return null;
  const { en, ar } = value as Record<string, unknown>;
  return typeof en === 'string' ? { en, ar: typeof ar === 'string' ? ar : en } : null;
}

function resolutionOf(value: string | null): NotificationResolution {
  return (NOTIFICATION_RESOLUTIONS as readonly string[]).includes(value ?? '')
    ? (value as NotificationResolution)
    : 'done';
}

function resolvedOf(item: StoredItem): NotificationResolved | null {
  if (!item.resolvedAt) return null;
  return {
    at: item.resolvedAt.toISOString(),
    by: nameOf(item.resolvedByName),
    resolution: resolutionOf(item.resolution),
  };
}

/**
 * What the reader gets (spec → `NotificationItem`): only the items they may still see (N11), newest
 * first; the sentence's values are the first item's plus `count` (N17); a single item carries its
 * link and its resolution, a group opens into its items. Null when no item is visible: the
 * notification is left out of the list.
 */
export function toNotificationView(
  row: StoredNotification,
  type: NotificationTypeDefinition,
  visibleItemIds: ReadonlySet<string>,
): NotificationItem | null {
  const items = row.items
    .filter((i) => visibleItemIds.has(i.id))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  const first = items[0];
  if (!first) return null;

  const entries: NotificationItemEntry[] = items.map((i) => {
    const params = paramsOf(i.params);
    return { id: i.id, params, link: type.link(subjectOf(i), params), resolved: resolvedOf(i) };
  });
  const single = entries.length === 1 ? entries[0] : undefined;
  const resolved: NotificationResolved | null = row.resolvedAt
    ? (single?.resolved ?? { at: row.resolvedAt.toISOString(), by: null, resolution: 'done' })
    : null;

  return {
    id: row.id,
    type: row.type,
    module: type.module,
    category: type.category,
    params: { ...paramsOf(first.params), count: entries.length },
    link: single?.link ?? null,
    items: entries,
    openCount: items.filter((i) => !i.resolvedAt).length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    resolved,
  };
}
