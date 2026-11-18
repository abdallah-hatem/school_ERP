import { Injectable } from '@nestjs/common';
import { PermissionScope, type NotificationSubject, type PermissionKey } from '@school-erp/shared';
import { PermissionsService, type UserScope } from '../permissions';
import { NoNotificationScopeResolverError, NotificationScopes } from './notification-scope';
import { NotificationTypes } from './notification-types';
import { subjectOf, type StoredNotification } from './notifications.pure';
import { RecipientsRepository } from './repositories/recipients.repository';

type Who = { id: string };

/** What to do with a scoped user when no module registered a resolver for the subject's type. */
type MissingResolver = 'throw' | 'hide';

/**
 * Who may see a notification (N5, N11) — the same rule when sending and when reading: the person
 * holds the type's permission (widest scope over all their roles, through `PermissionsService`),
 * and that scope covers the item's subject. `all` covers everything; any other scope needs the
 * person's linked employee (none → nothing scoped, R5) and is checked by the resolver the owning
 * module registered for the subject's entity type.
 */
@Injectable()
export class NotificationAccess {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly scopes: NotificationScopes,
    private readonly types: NotificationTypes,
    private readonly recipients: RecipientsRepository,
  ) {}

  /**
   * The users who receive an item about `subject` (N5): active holders of `permission` whose scope
   * covers it, minus the person who caused it (GUESS: you aren't told about your own action), in id
   * order. A scoped holder with no resolver for the subject's type throws (a programming error —
   * never "send to everyone"); zero holders is fine.
   */
  async recipientsFor(
    permission: PermissionKey,
    subject: NotificationSubject,
    actorId: string | null,
  ): Promise<string[]> {
    const out: string[] = [];
    for (const id of await this.recipients.holdersOf(permission)) {
      if (id === actorId) continue;
      const scope = await this.permissions.scopeFor({ id }, permission);
      if (!scope) continue;
      const [covered] = await this.covers(scope, [subject], 'throw');
      if (covered) out.push(id);
    }
    return out;
  }

  /**
   * The ids of the items the reader may still see (N11): their current permission for each item's
   * type and its current scope. An item of a type the code no longer knows, or whose subject no
   * module can check, is hidden (fail closed). Nothing is deleted.
   */
  async visibleItems(reader: Who, rows: readonly StoredNotification[]): Promise<Set<string>> {
    const byType = new Map<string, StoredNotification['items']>();
    for (const row of rows) {
      for (const item of row.items) {
        const list = byType.get(item.type) ?? [];
        list.push(item);
        byType.set(item.type, list);
      }
    }
    const visible = new Set<string>();
    for (const [type, items] of byType) {
      const definition = this.types.find(type);
      if (!definition) continue;
      const scope = await this.permissions.scopeFor(reader, definition.permission);
      if (!scope) continue;
      const covered = await this.covers(scope, items.map(subjectOf), 'hide');
      items.forEach((item, i) => {
        if (covered[i]) visible.add(item.id);
      });
    }
    return visible;
  }

  /** Whether `scope` covers each subject, in order. */
  private async covers(
    scope: UserScope,
    subjects: readonly NotificationSubject[],
    missing: MissingResolver,
  ): Promise<boolean[]> {
    if (scope.scope === PermissionScope.ALL) return subjects.map(() => true);
    const result = subjects.map(() => false);
    // A scoped user with no linked employee covers nobody (R5) — no resolver is asked.
    if (!scope.employeeId) return result;

    const byEntityType = new Map<string, number[]>();
    subjects.forEach((s, i) =>
      byEntityType.set(s.entityType, [...(byEntityType.get(s.entityType) ?? []), i]),
    );
    for (const [entityType, indexes] of byEntityType) {
      const resolver = this.scopes.find(entityType);
      if (!resolver) {
        if (missing === 'throw') throw new NoNotificationScopeResolverError(entityType);
        continue;
      }
      const answers = await resolver(
        scope,
        indexes.map((i) => subjects[i]),
      );
      indexes.forEach((subjectIndex, k) => {
        result[subjectIndex] = answers[k] === true;
      });
    }
    return result;
  }
}
