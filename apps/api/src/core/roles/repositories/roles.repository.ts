import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma, type PermissionScope } from '@prisma/client';
import { PAGINATION, SYSTEM_ADMIN_ROLE, type Paginated, type RoleRef } from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';
import { searchWhere } from '../../../common/repositories/search';

const roleRefSelect = {
  id: true,
  key: true,
  nameEn: true,
  nameAr: true,
} satisfies Prisma.RoleSelect;

const roleSelect = {
  ...roleRefSelect,
  builtIn: true,
  permissions: { select: { permissionKey: true, scope: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

export type RoleRow = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export interface StoredRoleGrant {
  permissionKey: string;
  scope: PermissionScope;
}

/**
 * `roles`, `role_permissions` and `user_roles` (core/roles owns them). Every call goes through
 * the caller's open transaction (`txHost.tx`), so a change and its audit entry commit together.
 */
@Injectable()
export class RolesRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Built-in roles first, in the spec's order; then custom roles by name. */
  async findPage(p: number, limit: number, search?: string): Promise<Paginated<RoleRow>> {
    const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const page = Math.max(1, p);
    const where: Prisma.RoleWhereInput = searchWhere(search) ?? {};
    const [data, total] = await Promise.all([
      this.db.role.findMany({
        where,
        select: roleSelect,
        orderBy: [{ builtIn: 'desc' }, { sortOrder: 'asc' }, { nameEn: 'asc' }],
        skip: (page - 1) * take,
        take,
      }),
      this.db.role.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit: take,
      hasNextPage: page * take < total,
      hasPreviousPage: page > 1,
    };
  }

  findById(id: string): Promise<RoleRow | null> {
    return this.db.role.findUnique({ where: { id }, select: roleSelect });
  }

  findRefsByIds(ids: readonly string[]): Promise<RoleRef[]> {
    return this.db.role.findMany({ where: { id: { in: [...ids] } }, select: roleRefSelect });
  }

  async create(data: {
    key: string;
    nameEn: string;
    nameAr: string;
    grants: StoredRoleGrant[];
  }): Promise<string> {
    const role = await this.db.role.create({
      data: {
        key: data.key,
        nameEn: data.nameEn,
        nameAr: data.nameAr,
        permissions: { createMany: { data: data.grants } },
      },
      select: { id: true },
    });
    return role.id;
  }

  async updateNames(id: string, names: { nameEn?: string; nameAr?: string }): Promise<void> {
    await this.db.role.update({ where: { id }, data: names, select: { id: true } });
  }

  async replaceGrants(roleId: string, grants: StoredRoleGrant[]): Promise<void> {
    await this.db.rolePermission.deleteMany({ where: { roleId } });
    if (grants.length > 0) {
      await this.db.rolePermission.createMany({ data: grants.map((g) => ({ ...g, roleId })) });
    }
    // Touch the role so its updatedAt says when its permissions last changed.
    await this.db.role.update({
      where: { id: roleId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.role.delete({ where: { id }, select: { id: true } });
  }

  /** Replaces the user's roles with `roleIds`. */
  async setRolesOf(userId: string, roleIds: readonly string[]): Promise<void> {
    // L-6: the user's row (a ceiling check on them waits, `UsersRepository.lockUser`) and the roles
    // given, shared (an edit of one of them, `lockRole`, waits — its held-by check sees this).
    await this.db.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
    await this.lockShared(roleIds);
    await this.db.userRoleAssignment.deleteMany({
      where: { userId, roleId: { notIn: [...roleIds] } },
    });
    await this.db.userRoleAssignment.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId })),
      skipDuplicates: true,
    });
  }

  /**
   * Locks the System admin role row until the transaction ends, so two requests that each remove
   * a System admin can't both pass the last-admin check (R8). Needs an open transaction.
   */
  async lockSystemAdminRole(): Promise<void> {
    await this.db.$queryRaw`SELECT "id" FROM "roles" WHERE "key" = ${SYSTEM_ADMIN_ROLE} FOR UPDATE`;
  }

  /**
   * Locks the role's row until the transaction ends (L-6): giving the role to someone
   * (`setRolesOf` takes it shared) waits, so the held-by checks of an edit can't go stale.
   */
  async lockRole(roleId: string): Promise<void> {
    // `FOR NO KEY UPDATE` (L3): still conflicts with `lockShared`'s `FOR SHARE`, but not with the
    // key-share locks of inserts that merely reference the role.
    await this.db.$queryRaw`SELECT "id" FROM "roles" WHERE "id" = ${roleId}::uuid FOR NO KEY UPDATE`;
  }

  /**
   * Takes the roles' rows shared until the transaction ends (L-6 / L1): an edit of one of them
   * (`lockRole`) waits until the giving is written — and the giving's ceiling check reads the grants
   * under this lock, so they can't change in between.
   */
  async lockShared(roleIds: readonly string[]): Promise<void> {
    if (roleIds.length === 0) return;
    await this.db.$queryRaw`SELECT "id" FROM "roles" WHERE "id" = ANY(${[...roleIds]}::uuid[]) FOR SHARE`;
  }

  /**
   * Takes the rows of the roles `userId` holds shared until the transaction ends (fourth review L-d):
   * the actor's own grants, read as their ceiling, can't change under the check. Always after any
   * `users` row lock (users first, then roles).
   */
  async lockRolesOfUser(userId: string): Promise<void> {
    await this.db.$queryRaw`
      SELECT r."id" FROM "roles" r JOIN "user_roles" ur ON ur."role_id" = r."id"
      WHERE ur."user_id" = ${userId}::uuid FOR SHARE OF r`;
  }

  /** Whether someone holding the role has no employee record (fourth review H1). */
  async hasUnlinkedHolder(roleId: string): Promise<boolean> {
    const count = await this.db.userRoleAssignment.count({ where: { roleId, user: { employeeId: null } } });
    return count > 0;
  }

  /** Whether `userId` holds the role. */
  async isHeldBy(roleId: string, userId: string): Promise<boolean> {
    return (await this.db.userRoleAssignment.count({ where: { roleId, userId } })) > 0;
  }

  /** Whether any user who holds the System admin role also holds this role (active or not). */
  async isHeldBySystemAdmin(roleId: string): Promise<boolean> {
    const count = await this.db.userRoleAssignment.count({
      where: { roleId, user: { roles: { some: { role: { key: SYSTEM_ADMIN_ROLE } } } } },
    });
    return count > 0;
  }

  /** Active users holding the System admin role, other than `exceptUserId`. */
  countOtherActiveSystemAdmins(exceptUserId: string): Promise<number> {
    return this.db.userRoleAssignment.count({
      where: {
        role: { key: SYSTEM_ADMIN_ROLE },
        userId: { not: exceptUserId },
        user: { isActive: true },
      },
    });
  }
}
