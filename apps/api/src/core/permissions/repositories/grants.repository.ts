import { SYSTEM_ADMIN_ROLE } from '@school-erp/shared';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { DbAdapter } from '../../../database/transactions';
import type { StoredGrant } from '../grants.pure';

/** The user's linked employee and that employee's stages (for scopes). */
export interface UserLink {
  employeeId: string | null;
  /** The linked employee's main stage. */
  stageId: string | null;
  /**
   * Every stage of the linked employee — main first, then their other stages (§3, owner
   * 2026-11-21): a stage head's `own_stage` covers all of them. Empty without a linked employee.
   */
  stageIds: string[];
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

  /**
   * Active users with a role that grants `key` — or the System admin role, which holds every key —
   * in id order. Their scope is `PermissionsService`'s call.
   */
  async holdersOf(key: string): Promise<string[]> {
    const rows = await this.txHost.tx.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              OR: [{ key: SYSTEM_ADMIN_ROLE }, { permissions: { some: { permissionKey: key } } }],
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async linkOf(userId: string): Promise<UserLink> {
    const row = await this.txHost.tx.user.findUnique({
      where: { id: userId },
      select: {
        employeeId: true,
        // Reads HR's `employee_stages` (reading other areas' tables is allowed).
        linkedEmployee: { select: { stageId: true, otherStages: { select: { stageId: true } } } },
      },
    });
    const employee = row?.linkedEmployee;
    return {
      employeeId: row?.employeeId ?? null,
      stageId: employee?.stageId ?? null,
      stageIds: employee ? [employee.stageId, ...employee.otherStages.map((s) => s.stageId)] : [],
    };
  }
}
