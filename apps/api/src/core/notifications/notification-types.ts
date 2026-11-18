import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPES, type NotificationTypeDefinition } from '@school-erp/shared';

/** A type key nobody registered: a programming error (a typo, or a type removed from the code). */
export class UnknownNotificationTypeError extends Error {
  constructor(type: string) {
    super(`Unknown notification type "${type}"`);
    this.name = UnknownNotificationTypeError.name;
  }
}

/**
 * The notification types core knows (N2): every type in `NOTIFICATION_TYPES` (packages/shared — each
 * module's types, with their texts), in registry order. `register` adds one at start-up; the tests
 * use it for a test-only type that exercises the mechanism without any module's rules.
 */
@Injectable()
export class NotificationTypes {
  private readonly types = new Map<string, NotificationTypeDefinition>(
    Object.entries(NOTIFICATION_TYPES) as [string, NotificationTypeDefinition][],
  );

  register(key: string, definition: NotificationTypeDefinition): void {
    if (this.types.has(key)) throw new Error(`Notification type "${key}" is registered twice`);
    this.types.set(key, definition);
  }

  has(key: string): boolean {
    return this.types.has(key);
  }

  get(key: string): NotificationTypeDefinition {
    const found = this.types.get(key);
    if (!found) throw new UnknownNotificationTypeError(key);
    return found;
  }

  /** The definition, or undefined for a key the code no longer knows (an old row): left out. */
  find(key: string): NotificationTypeDefinition | undefined {
    return this.types.get(key);
  }

  /** Every type, in registry order. */
  all(): [string, NotificationTypeDefinition][] {
    return [...this.types.entries()];
  }
}
