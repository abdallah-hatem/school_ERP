import { Injectable } from '@nestjs/common';
import type { NotificationSubject } from '@school-erp/shared';
import type { UserScope } from '../permissions';

/**
 * Whether a user's scope (`own_stage`, `own_team`, `self` — never `all`, which covers everything)
 * covers each subject, in order. Registered by the module that owns the subjects (HR: "is employee X
 * in this user's stage / team?"), since core can't know what "my team" means (N5). The user's
 * linked employee is never null here: core leaves unlinked scoped users out first (R5).
 */
export type NotificationScopeResolver = (
  scope: UserScope,
  subjects: readonly NotificationSubject[],
) => Promise<boolean[]>;

/** A scoped recipient for a subject type no module registered a resolver for: a programming error. */
export class NoNotificationScopeResolverError extends Error {
  constructor(entityType: string) {
    super(
      `No NotificationScopeResolver registered for "${entityType}": a scoped recipient can't be ` +
        'checked (register one at start-up with NotificationsService.registerScopeResolver)',
    );
    this.name = NoNotificationScopeResolverError.name;
  }
}

/** The resolvers modules registered, per subject entity type (the same pattern as `AuditRecordAccess`). */
@Injectable()
export class NotificationScopes {
  private readonly resolvers = new Map<string, NotificationScopeResolver>();

  register(entityType: string, resolver: NotificationScopeResolver): void {
    this.resolvers.set(entityType, resolver);
  }

  find(entityType: string): NotificationScopeResolver | undefined {
    return this.resolvers.get(entityType);
  }
}
