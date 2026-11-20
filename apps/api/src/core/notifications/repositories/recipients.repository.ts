import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { SYSTEM_ADMIN_ROLE, type NotificationName, type PermissionKey } from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';

/**
 * Read-only: who could receive a notification. Reads `users`, `user_roles`, `roles`,
 * `role_permissions` (core/users and core/roles own them) and `employees` (HR) — reading other
 * areas' tables is allowed, writing them is not. Which scope each holder has comes from
 * `PermissionsService`, the one place that decides it.
 */
@Injectable()
export class RecipientsRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Active users with a role that grants `key` — or the System admin role, which holds every key. */
  async holdersOf(key: PermissionKey): Promise<string[]> {
    const rows = await this.db.user.findMany({
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

  /**
   * A person's name for "Approved by …", as it is now: their linked employee's two names, else the
   * account's name in both languages. Null for an unknown id.
   */
  async nameOf(userId: string): Promise<NotificationName | null> {
    const row = await this.db.user.findUnique({
      where: { id: userId },
      select: { name: true, linkedEmployee: { select: { nameEn: true, nameAr: true } } },
    });
    if (!row) return null;
    return row.linkedEmployee
      ? { en: row.linkedEmployee.nameEn, ar: row.linkedEmployee.nameAr }
      : { en: row.name, ar: row.name };
  }
}
