import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  ErrorCode,
  SYSTEM_ADMIN_ROLE,
  type Paginated,
  type Role,
  type RoleRef,
} from '@school-erp/shared';
import { randomBytes } from 'node:crypto';
import { CodedException } from '../../common/errors/coded.exception';
import { AuditService } from '../audit';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesRepository, type RoleRow } from './repositories/roles.repository';
import { duplicateKey, roleSnapshot, storedGrants, toRole, wronglyScoped } from './roles.pure';

const fromRow = (row: RoleRow): Role =>
  toRole({ ...row, userCount: row._count.users, permissions: row.permissions });

/**
 * Roles as data (R2): named sets of permissions with a scope each (R5). Built-in roles (the
 * spec's starting roles) can be edited, and deleted once unused like any other; the System admin
 * can't be deleted and always holds every key.
 * Also owns who holds which role (`user_roles`) and the last-System-admin rule (R8) — core/users
 * calls those when it changes a user.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly audit: AuditService,
  ) {}

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

  async create(dto: CreateRoleDto): Promise<Role> {
    this.assertNoDuplicates(dto.permissions);
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

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const before = await this.get(id);
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
   * included. Grant migrations join on the role's key, so they skip a deleted starting role.
   */
  async remove(id: string): Promise<void> {
    const role = await this.get(id);
    if (role.key === SYSTEM_ADMIN_ROLE) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.SYSTEM_ADMIN_UNDELETABLE);
    }
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
