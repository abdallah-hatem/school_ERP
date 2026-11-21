import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser, PermissionKey, PermissionScope } from '@school-erp/shared';
import { ClsService } from 'nestjs-cls';
import { resolveGrants, type ResolvedGrants } from './grants.pure';
import { GrantsRepository, type UserLink } from './repositories/grants.repository';

/**
 * Which rows a permission covers for a user (R5), for the module that owns the data to apply in
 * its repository query. `employeeId` / `stageIds` are the user's linked employee and its stages;
 * when a scope needs one and it is null (no linked employee), the module returns no rows.
 */
export interface UserScope extends UserLink {
  scope: PermissionScope;
}

/** CLS keys: per-request caches, one entry per user id. */
const GRANTS_CACHE = Symbol('permissions:grants');
const LINK_CACHE = Symbol('permissions:link');

type Who = Pick<AuthUser, 'id'>;

/**
 * What a user may do, from their roles in the database (R2). The guard and `/auth/me` call
 * `permissionsFor`; modules call `scopeFor` (P4 applies it in HR).
 *
 * Read once per request and cached in the request context, so a change to a role or to a user's
 * roles applies from the user's next request — no new sign-in (edge case 7). Outside a request
 * (seed, scripts) nothing is cached.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    private readonly grants: GrantsRepository,
    private readonly cls: ClsService,
  ) {}

  /** The keys the user holds, in registry order: the union of their roles (edge case 2). */
  async permissionsFor(user: Who): Promise<PermissionKey[]> {
    return [...(await this.resolved(user)).scopes.keys()];
  }

  /** The widest scope the user holds `key` with, plus their employee and stage; null if not held. */
  async scopeFor(user: Who, key: PermissionKey): Promise<UserScope | null> {
    const scope = (await this.resolved(user)).scopes.get(key);
    if (!scope) return null;
    return { scope, ...(await this.link(user)) };
  }

  /**
   * Every active user holding `key`, with the widest scope they hold it with and their employee
   * and stages — for a module asking "who may act on this?" (HR: who heads a stage, §4).
   */
  async holdersWithScope(key: PermissionKey): Promise<{ userId: string; scope: UserScope }[]> {
    const out: { userId: string; scope: UserScope }[] = [];
    for (const userId of await this.grants.holdersOf(key)) {
      const scope = await this.scopeFor({ id: userId }, key);
      if (scope) out.push({ userId, scope });
    }
    return out;
  }

  /** The user's linked employee (who they are in HR), or null. */
  async linkedEmployeeOf(user: Who): Promise<string | null> {
    return (await this.link(user)).employeeId;
  }

  private resolved(user: Who): Promise<ResolvedGrants> {
    return this.cached(GRANTS_CACHE, user.id, async () => {
      const result = resolveGrants(await this.grants.grantsOf(user.id));
      if (result.unknown.length > 0) {
        // Edge case 8 — a key removed from the code but still stored: ignored, and reported.
        this.logger.warn(
          `Ignoring unknown permission rows for user ${user.id}: ${result.unknown.join(', ')}`,
        );
      }
      return result;
    });
  }

  private link(user: Who): Promise<UserLink> {
    return this.cached(LINK_CACHE, user.id, () => this.grants.linkOf(user.id));
  }

  private cached<T>(key: symbol, userId: string, load: () => Promise<T>): Promise<T> {
    if (!this.cls.isActive()) return load();
    const cache = this.cls.get<Map<string, Promise<T>> | undefined>(key) ?? new Map();
    this.cls.set(key, cache);
    const found = cache.get(userId);
    if (found) return found;
    const loading = load();
    cache.set(userId, loading);
    // A failed read is not cached: the next call in the request tries again.
    void loading.catch(() => {
      cache.delete(userId);
    });
    return loading;
  }
}
