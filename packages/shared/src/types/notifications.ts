import type {
  NotificationCategory,
  NotificationChannel,
  NotificationLink,
  NotificationResolution,
} from '../notifications';
import type { IsoDateTime, Uuid } from './common';

/*
 * The notifications API (spec → API (contract)). Every route is for the signed-in user's own
 * notifications; the recipient comes from the token.
 */

/** A name as it was when the item was resolved, in both languages. */
export interface NotificationName {
  en: string;
  ar: string;
}

/** How an item (or a whole notification) was resolved: when, by whom, how. */
export interface NotificationResolved {
  at: IsoDateTime;
  by: NotificationName | null;
  resolution: NotificationResolution;
}

/** One item of a notification (N17): what it is about, its values and its link. */
export interface NotificationItemEntry {
  id: Uuid;
  params: Record<string, unknown>;
  link: NotificationLink | null;
  resolved: NotificationResolved | null;
}

/** One notification in the bell: a single item, or a group of items of one type (N17). */
export interface NotificationItem {
  id: Uuid;
  /** The type key (`hr.penalty.awaiting_approval`); a string, so a type added later still reads. */
  type: string;
  module: string;
  category: NotificationCategory;
  /** The sentence's values: the first item's, plus `count` (the items listed). */
  params: Record<string, unknown>;
  /** The record it opens: the item's own when there is one item; null for a group (it opens its items). */
  link: NotificationLink | null;
  /** Only the items the reader may still see (N11), newest first. */
  items: NotificationItemEntry[];
  /** Items not resolved yet. */
  openCount: number;
  createdAt: IsoDateTime;
  /** When its latest item arrived. */
  updatedAt: IsoDateTime;
  readAt: IsoDateTime | null;
  resolved: NotificationResolved | null;
}

export interface NotificationUnreadCount {
  count: number;
}

export interface NotificationsReadAll {
  updated: number;
}

/** A channel and whether it is live (today only `in_app`, always live). */
export interface NotificationChannelState {
  channel: NotificationChannel;
  available: boolean;
}

/** My account → Notifications: the types the person can receive, one entry per channel. */
export interface NotificationPreferences {
  channels: NotificationChannelState[];
  types: {
    type: string;
    module: string;
    category: NotificationCategory;
    canTurnOff: boolean;
    channels: {
      channel: NotificationChannel;
      /** What applies now (N13). */
      enabled: boolean;
      /** What the school's default would give. */
      schoolDefault: boolean;
      /** The person's own choice; null when they follow the school's default. */
      personal: boolean | null;
      /** Can't be changed (a type that can't be turned off, in the app). */
      locked: boolean;
    }[];
  }[];
}

export interface NotificationRetention {
  readDays: number;
  resolvedDays: number;
  maxDays: number;
}

/** Settings → Notifications: the school's default per type and channel, and the retention. */
export interface NotificationSettings {
  channels: NotificationChannelState[];
  defaults: {
    type: string;
    module: string;
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean;
    locked: boolean;
  }[];
  retention: NotificationRetention;
}
