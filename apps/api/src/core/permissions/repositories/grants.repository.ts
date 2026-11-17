import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { DbAdapter } from '../../../database/transactions';
import type { StoredGrant } from '../grants.pure';

/** The user's linked employee and that employee's stage (for scopes). */
export interface UserLink {
  employeeId: string | null;
  stageId: string | null;
}

/**
 * Read-only: what a user holds. Reads `user_roles` / `roles` / `role_permissions` (owned by
 * core/roles) and the user's employee link — reading other areas' tables is allowed, writing
 * them is not.
 */
@Injectable()
export class GrantsRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  /** One row per (role, permission) of the user's roles; a role without permissions gives one row with nulls. */
  async grantsOf(userId: string): Promise<StoredGrant[]> {
    const assignments = await this.txHost.tx.userRoleAssignment.findMany({
      where: { userId },
      select: {
        role: {
          select: { key: true, permissions: { select: { permissionKey: true, scope: true } } },
        },
      },
    });
    return assignments.flatMap(({ role }): StoredGrant[] =>
      role.permissions.length === 0
        ? [{ roleKey: role.key, permissionKey: null, scope: null }]
        : role.permissions.map((p) => ({
            roleKey: role.key,
            permissionKey: p.permissionKey,
            scope: p.scope,
          })),
    );
  }

  async linkOf(userId: string): Promise<UserLink> {
    const row = await this.txHost.tx.user.findUnique({
      where: { id: userId },
      select: { employeeId: true, linkedEmployee: { select: { stageId: true } } },
    });
    return { employeeId: row?.employeeId ?? null, stageId: row?.linkedEmployee?.stageId ?? null };
  }
}
