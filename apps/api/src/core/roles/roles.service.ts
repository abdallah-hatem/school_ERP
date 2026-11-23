import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  ErrorCode,
  SYSTEM_ADMIN_ROLE,
  firstGrantOverCeiling,
  type AuthUser,
  type HeldGrants,
  type Paginated,
  type Role,
  type RoleGrant,
  type RoleRef,
} from '@school-erp/shared';
import { randomBytes } from 'node:crypto';
import { CodedException } from '../../common/errors/coded.exception';
import { AuditService } from '../audit';
import { PermissionsService } from '../permissions';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesRepository, type RoleRow } from './repositories/roles.repository';
import { duplicateKey, roleSnapshot, storedGrants, toRole, wronglyScoped } from './roles.pure';

const fromRow = (row: RoleRow): Role =>
  toRole({ ...row, userCount: row._count.users, permissions: row.permissions });

/** Who is acting: the signed-in user; absent when the system itself acts (seed, scripts). */
type Actor = Pick<AuthUser, 'id'> | undefined;

/** The system itself (no signed-in user) has no ceiling. */
const NO_CEILING: HeldGrants = { isSystemAdmin: true, grants: [] };

/**
 * Roles as data (R2): named sets of permissions with a scope each (R5). Built-in roles (the
 * spec's starting roles) can be edited, and deleted once unused like any other; the System admin
 * can't be deleted and always holds every key.
 * Also owns who holds which role (`user_roles`) and the last-System-admin rule (R8) — core/users
 * calls those when it changes a user.
 *
 * The access ceiling (security review H2, owner 2026-11-23): someone with `core.roles.manage` who
 * isn't a System admin may put into a role only permissions they hold themselves, at a scope that
 * reaches no further than theirs (`grantWithinCeiling`: 403 `GRANT_EXCEEDS_OWN`); may not edit a
 * role they hold (403 `ROLE_HELD_BY_YOU`) nor one a System admin user holds, the System admin role
 * included (403 `ROLE_HELD_BY_SYSTEM_ADMIN`). Deleting needs nobody to hold the role, so a held role
 * is never deleted anyway.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  /** What `actor` may give (H1/H2): every grant they hold, or no ceiling for a System admin. */
  async ceilingOf(actor: Actor): Promise<HeldGrants> {
    return actor ? this.permissions.heldGrants(actor) : NO_CEILING;
  }

  /** 403 `GRANT_EXCEEDS_OWN` when `grants` holds anything over `ceiling` (H1/H2). */
  assertWithinCeiling(ceiling: HeldGrants, grants: readonly RoleGrant[]): void {
    if (firstGrantOverCeiling(ceiling, grants)) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.GRANT_EXCEEDS_OWN);
    }
  }

  /** Every permission the roles with these ids grant (the System admin role: every key, `all`). */
  async grantsOfRoles(ids: readonly string[]): Promise<RoleGrant[]> {
    const roles = await Promise.all([...new Set(ids)].map((id) => this.get(id)));
    return roles.flatMap((r) => r.permissions);
  }

  /** One page of the roles (starting ones first), searched by either name when `search` is given. */
  async list(page: number, limit: number, search?: string): Promise<Paginated<Role>> {
    const result = await this.roles.findPage(page, limit, search);
    return { ...result, data: result.data.map(fromRow) };
  }

  async get(id: string): Promise<Role> {
    const row = await this.roles.findById(id);
    if (!row) throw new NotFoundException('Role not found');
    return fromRow(row);
  }

  async create(dto: CreateRoleDto, actor?: Actor): Promise<Role> {
    this.assertNoDuplicates(dto.permissions);
    this.assertWithinCeiling(await this.ceilingOf(actor), dto.permissions);
    const id = await this.roles.create({
      key: `custom_${randomBytes(4).toString('hex')}`,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      grants: storedGrants(dto.permissions),
    });
    const role = await this.get(id);
    await this.audit.record({
      action: 'core.role.create',
      entity: this.entity(role),
      after: roleSnapshot(role),
    });
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actor?: Actor): Promise<Role> {
    // L-6: nobody is given this role while it is checked and changed.
    await this.roles.lockRole(id);
    const before = await this.get(id);
    const ceiling = await this.ceilingOf(actor);
    if (!ceiling.isSystemAdmin && actor) {
      // H2: not a role they hold (they would raise their own access), nor a System admin's.
      if (await this.roles.isHeldBy(id, actor.id)) {
        throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.ROLE_HELD_BY_YOU);
      }
      if (before.key === SYSTEM_ADMIN_ROLE || (await this.roles.isHeldBySystemAdmin(id))) {
        throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.ROLE_HELD_BY_SYSTEM_ADMIN);
      }
    }
    // L-4: what it grants now and what it will grant — removing a grant beyond theirs (taking it from
    // its holders) is as much over the ceiling as adding one.
    this.assertWithinCeiling(ceiling, [...before.permissions, ...(dto.permissions ?? [])]);
    if (dto.permissions !== undefined) {
      // R8 — the System admin holds every key, always: its set can't be narrowed.
      if (before.key === SYSTEM_ADMIN_ROLE) {
        throw new CodedException(HttpStatus.CONFLICT, ErrorCode.SYSTEM_ADMIN_FIXED);
      }
      this.assertNoDuplicates(dto.permissions);
      await this.roles.replaceGrants(id, storedGrants(dto.permissions));
    }
    if (dto.nameEn !== undefined || dto.nameAr !== undefined) {
      await this.roles.updateNames(id, { nameEn: dto.nameEn, nameAr: dto.nameAr });
    }
    const after = await this.get(id);
    // Called on the no-change path too: it writes nothing then (D6b).
    await this.audit.record({
      action: 'core.role.update',
      entity: this.entity(after),
      before: roleSnapshot(before),
      after: roleSnapshot(after),
    });
    return after;
  }

  /**
   * Any role but the System admin, once nobody holds it (owner 2026-11-19) — starting roles
   * included. Grant migrations join on the role's key, so they skip a deleted starting role. A
   * non-System-admin deletes only a role within their ceiling (L-4: 403 `GRANT_EXCEEDS_OWN`).
   */
  async remove(id: string, actor?: Actor): Promise<void> {
    await this.roles.lockRole(id);
    const role = await this.get(id);
    if (role.key === SYSTEM_ADMIN_ROLE) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.SYSTEM_ADMIN_UNDELETABLE);
    }
    this.assertWithinCeiling(await this.ceilingOf(actor), role.permissions);
    if (role.userCount > 0) throw new CodedException(HttpStatus.CONFLICT, ErrorCode.ROLE_IN_USE);
    await this.roles.delete(id);
    await this.audit.record({
      action: 'core.role.delete',
      entity: this.entity(role),
      before: roleSnapshot(role),
    });
  }

  // ── who holds which role (for core/users) ────────────────────────────────

  /** The roles with these ids; `UNKNOWN_ROLE` (400) if any is missing. */
  async refsByIds(ids: readonly string[]): Promise<RoleRef[]> {
    const unique = [...new Set(ids)];
    const found = await this.roles.findRefsByIds(unique);
    if (found.length !== unique.length) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.UNKNOWN_ROLE);
    }
    return found;
  }

  /** Replaces the user's roles. Call inside the request's transaction. */
  setRolesOf(userId: string, roleIds: readonly string[]): Promise<void> {
    return this.roles.setRolesOf(userId, [...new Set(roleIds)]);
  }

  /**
   * R8 / edge case 5 — refuses (`LAST_SYSTEM_ADMIN`, 409) when `userId` is the last active
   * System admin and is about to lose the role or be deactivated. Locks the role row for the rest
   * of the transaction, so two such changes at once can't both pass.
   */
  async assertAnotherSystemAdmin(userId: string): Promise<void> {
    await this.roles.lockSystemAdminRole();
    if ((await this.roles.countOtherActiveSystemAdmins(userId)) === 0) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.LAST_SYSTEM_ADMIN);
    }
  }

  private assertNoDuplicates(grants: CreateRoleDto['permissions']): void {
    if (duplicateKey(grants)) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.DUPLICATE_PERMISSION);
    }
    // A whole-school permission (settings, lists, running payroll) has no rows to narrow (P3).
    if (wronglyScoped(grants)) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_SCOPE);
    }
  }

  private entity(role: Pick<Role, 'id' | 'nameEn' | 'nameAr'>) {
    return { type: AuditEntityType.ROLE, id: role.id, label: { en: role.nameEn, ar: role.nameAr } };
  }
}
