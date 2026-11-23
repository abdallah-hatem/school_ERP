import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  CoreEvent,
  ErrorCode,
  SYSTEM_ADMIN_ROLE,
  actsOnPay,
  type AuthUser,
  type EmployeeOption,
  type HeldGrants,
  type Paginated,
  type RoleRef,
  type UserAccount,
  type UserSessionsEndedEvent,
} from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { hashPassword, normalizeEmail, verifyPassword } from '../../common/utils/password.util';
import { AfterCommit } from '../../database/transactions';
import { AuditService } from '../audit';
import { DomainEvents } from '../events';
import { RolesService } from '../roles';
import { SignInLimitService } from '../sign-in-limit';
import type {
  ChangePasswordDto,
  CreateUserDto,
  EmployeeOptionsQueryDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersRepository, type UserAccountRow } from './repositories/users.repository';
import { SessionRevocation } from './session-revocation';
import { accountSnapshot, toEmployeeOption, toUserAccount } from './users.pure';

/** Who is acting: the signed-in user; absent when the system itself acts (seed, scripts). */
type Actor = Pick<AuthUser, 'id'> | undefined;

/**
 * Administration → Users (R9, spec P2): a System admin creates accounts (no self sign-up), gives
 * them roles, links an employee, deactivates and reactivates them and sets temporary passwords;
 * every user changes their own password. Every write is audited (R8, `core.user.*`) inside the
 * request's transaction, and the last active System admin can never lose the role (edge case 5).
 *
 * The access ceiling (security review H1, owner 2026-11-23). Someone with `core.users.manage` who
 * isn't a System admin:
 * - can't give or take away the System admin role, nor edit, reset the password of, deactivate or
 *   reactivate a user who holds it (403 `SYSTEM_ADMIN_ONLY`);
 * - may give or take away only roles whose every grant is within their own (`grantWithinCeiling`:
 *   the same key, a scope reaching no further), and may manage only users whose every grant is
 *   within it — else they could reset a stronger user's password and sign in as them (403
 *   `GRANT_EXCEEDS_OWN`).
 * Nobody — a System admin included — changes their own roles or employee record (403
 * `OWN_ACCESS_CHANGE`): another administrator does.
 *
 * Third review (owner 2026-11-23):
 * - M1: the ceiling compares scope labels, not reach (a Primary head's `own_stage` is not the Prep
 *   head's). So only a System admin gives a temporary password to, changes the email of, or unlocks
 *   an account **linked to an employee record** (403 `LINKED_ACCOUNT_ADMIN_ONLY`) — taking it over
 *   would reach what it reaches. Unlinked accounts can't act on pay (M2), and reach nobody through
 *   a stage, team or self scope.
 * - M2: a non-System-admin can't give an unlinked account a role acting on pay or penalties
 *   (`actsOnPay`, 403 `UNLINKED_PAY_ROLE`) — its "own" line couldn't be told apart.
 * - L1: the roles given are locked (`FOR SHARE`) before their grants are read for the ceiling.
 */
@Injectable()
export class UserAccountsService {
  constructor(
    private readonly users: UsersRepository,
    private readonly roles: RolesService,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
    private readonly events: DomainEvents,
    private readonly signInLimit: SignInLimitService,
    private readonly sessions: SessionRevocation,
  ) {}

  async list(query: ListUsersQueryDto): Promise<Paginated<UserAccount>> {
    const result = await this.users.findAccountPage(
      {
        search: query.search || undefined,
        isActive: query.status === undefined ? undefined : query.status === 'active',
        roleId: query.roleId,
      },
      query.page ?? 1,
      query.limit ?? 10,
    );
    const locked = await this.signInLimit.lockedUntil(result.data.map((r) => r.email));
    return {
      ...result,
      data: result.data.map((r) => toUserAccount(r, locked.get(r.email) ?? null)),
    };
  }

  async get(id: string): Promise<UserAccount> {
    const row = await this.row(id);
    const locked = await this.signInLimit.lockedUntil([row.email]);
    return toUserAccount(row, locked.get(row.email) ?? null);
  }

  async create(dto: CreateUserDto, actor?: Actor): Promise<UserAccount> {
    const email = normalizeEmail(dto.email);
    await this.assertEmailFree(email);
    const ceiling = await this.roles.ceilingOf(actor);
    // L1: the roles given can't change between the ceiling check and the write.
    await this.roles.lockForGiving(dto.roleIds);
    await this.assertMayAssign(await this.roles.refsByIds(dto.roleIds), ceiling);
    const employeeId = dto.employeeId ?? null;
    if (employeeId) this.assertMayLinkEmployee(ceiling);
    if (dto.roleIds.length > 0) await this.assertPayRolesLinked(dto.roleIds, employeeId, ceiling);
    if (employeeId) await this.assertEmployeeFree(employeeId);

    const id = await this.users.create({
      name: dto.name,
      email,
      passwordHash: await hashPassword(dto.password),
      employeeId,
    });
    await this.roles.setRolesOf(id, dto.roleIds);
    const user = await this.get(id);
    await this.audit.record({
      action: 'core.user.create',
      entity: this.entity(user),
      after: accountSnapshot(user),
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor?: Actor): Promise<UserAccount> {
    // L-6 / L1: their roles, and the roles given, can't change between the ceiling check and the write.
    const before = await this.lockTarget(id, dto.roleIds ?? []);
    const ceiling = await this.roles.ceilingOf(actor);
    await this.assertMayManage(before, ceiling);
    const heldIds = new Set(before.roles.map((r) => r.id));
    const nextIds = dto.roleIds === undefined ? heldIds : new Set(dto.roleIds);
    const changedRoleIds = [
      ...[...nextIds].filter((r) => !heldIds.has(r)),
      ...[...heldIds].filter((r) => !nextIds.has(r)),
    ];
    const changesEmployee =
      dto.employeeId !== undefined && (dto.employeeId ?? null) !== (before.employee?.id ?? null);
    // H1: nobody changes their own roles. Nor who they are in HR — except a System admin, who holds
    // every scope already, so the link widens nothing (a sole admin must be able to link themselves).
    if (actor?.id === id && (changedRoleIds.length > 0 || (changesEmployee && !ceiling.isSystemAdmin))) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.OWN_ACCESS_CHANGE);
    }
    // H-1: a stage, team or self scope is anchored to the link, so only a System admin changes it.
    if (changesEmployee) this.assertMayLinkEmployee(ceiling);
    const email = dto.email === undefined ? undefined : normalizeEmail(dto.email);
    if (email !== undefined && email !== before.email) {
      // M1: changing the email (then resetting through it) is a takeover too.
      this.assertMayTakeOver(before, actor, ceiling);
      await this.assertEmailFree(email, id);
    }
    if (dto.employeeId && dto.employeeId !== before.employee?.id) {
      await this.assertEmployeeFree(dto.employeeId, id);
    }

    if (dto.roleIds !== undefined) {
      const next = await this.roles.refsByIds(dto.roleIds);
      // H1: the roles given or taken away must be within the actor's own grants.
      await this.assertMayAssign(await this.roles.refsByIds(changedRoleIds), ceiling);
      // M2: a role acting on pay or penalties needs an employee record behind the account.
      if ([...nextIds].some((r) => !heldIds.has(r))) {
        const linked = dto.employeeId !== undefined ? (dto.employeeId ?? null) : (before.employee?.id ?? null);
        await this.assertPayRolesLinked(dto.roleIds, linked, ceiling);
      }
      const losesAdmin =
        before.roles.some((r) => r.key === SYSTEM_ADMIN_ROLE) &&
        !next.some((r) => r.key === SYSTEM_ADMIN_ROLE);
      if (losesAdmin && before.isActive) await this.roles.assertAnotherSystemAdmin(id);
      await this.roles.setRolesOf(id, dto.roleIds);
    }
    await this.users.update(id, { name: dto.name, email, employeeId: dto.employeeId });

    const after = await this.get(id);
    await this.audit.record({
      action: 'core.user.update',
      entity: this.entity(after),
      before: accountSnapshot(before),
      after: accountSnapshot(after),
    });
    return after;
  }

  /** Edge case 6 — the user's sessions end at once: their next request is a 401. */
  async deactivate(id: string, actor?: Actor): Promise<UserAccount> {
    const before = await this.lockTarget(id);
    await this.assertMayManage(before, await this.roles.ceilingOf(actor));
    if (!before.isActive) return this.recordStatus('core.user.deactivate', before, before);
    if (before.roles.some((r) => r.key === SYSTEM_ADMIN_ROLE)) {
      await this.roles.assertAnotherSystemAdmin(id);
    }
    // Pre-existing gap (third review): the access tokens from before stay dead after a reactivation.
    const at = new Date();
    await this.users.update(id, { isActive: false, sessionsValidAfter: at });
    // L-b: every sign-in ends inside this transaction; the event follows for logging.
    await this.sessions.endOtherSessions(id, at);
    await this.endSessions(id, 'deactivated');
    return this.recordStatus('core.user.deactivate', before, await this.get(id));
  }

  async reactivate(id: string, actor?: Actor): Promise<UserAccount> {
    const before = await this.lockTarget(id);
    await this.assertMayManage(before, await this.roles.ceilingOf(actor));
    if (!before.isActive) await this.users.update(id, { isActive: true, sessionsValidAfter: new Date() });
    return this.recordStatus('core.user.reactivate', before, await this.get(id));
  }

  /** An admin sets a temporary password: the user must change it, and their sessions end. */
  async setTemporaryPassword(id: string, password: string, actor?: Actor): Promise<void> {
    const user = await this.lockTarget(id);
    const ceiling = await this.roles.ceilingOf(actor);
    await this.assertMayManage(user, ceiling);
    this.assertMayTakeOver(user, actor, ceiling);
    const at = new Date();
    await this.users.update(id, {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      passwordChangedAt: at,
    });
    // L-b: every sign-in ends inside this transaction; the event follows for logging.
    await this.sessions.endOtherSessions(id, at);
    await this.endSessions(id, 'temporary_password');
    // The password itself is never stored in the log (D7): the entry says only that it was set.
    await this.audit.record({ action: 'core.user.set_password', entity: this.entity(user) });
  }

  /**
   * Unlocks the user's sign-in before the lock ends (a System admin, from the Users page): their
   * wrong-password count is forgotten. Recorded as `core.user.unlock_sign_in`; nothing is written
   * when it wasn't locked. Under the same ceiling as a deactivation (security review M-1).
   */
  async unlockSignIn(id: string, actor?: Actor): Promise<UserAccount> {
    const before = await this.lockTarget(id);
    const ceiling = await this.roles.ceilingOf(actor);
    await this.assertMayManage(before, ceiling);
    this.assertMayTakeOver(before, actor, ceiling);
    await this.signInLimit.unlock(before.email);
    const after = await this.get(id);
    await this.audit.record({
      action: 'core.user.unlock_sign_in',
      entity: this.entity(after),
      before: { lockedUntil: before.lockedUntil },
      after: { lockedUntil: after.lockedUntil },
    });
    return after;
  }

  /** My account: the signed-in user's own account (roles, linked employee, sign-in facts). */
  async myAccount(me: AuthUser): Promise<UserAccount> {
    return this.get(me.id);
  }

  /** The linked-employee picker: employees matching the search, with who is already linked. */
  async employeeOptions(query: EmployeeOptionsQueryDto): Promise<Paginated<EmployeeOption>> {
    const result = await this.users.findEmployeeOptionPage(
      query.search || undefined,
      query.page ?? 1,
      query.limit ?? 10,
    );
    return { ...result, data: result.data.map(toEmployeeOption) };
  }

  /**
   * The signed-in user changes their own password. The current one must be right — except right
   * after signing in with a temporary password (`mustChangePassword`), where that sign-in just
   * proved it (the forced "Set a new password" page asks only for the new one). Either way the new
   * password must differ from the one in use (`SAME_PASSWORD`), and the flag is cleared.
   *
   * Both paths have the sign-in limit: while the account is locked the change is refused (429)
   * before any password is checked, and a wrong current password counts as a wrong sign-in.
   *
   * Security review M3 (2026-11-23): a changed password ends every **other** sign-in of the user
   * (`core.user.sessions_ended`, reason `password_changed`, after the commit) — whoever knew the old
   * password is signed out. `currentSession` (the refresh-token family of the request's access
   * token) is kept, so the person changing it stays signed in.
   */
  async changeOwnPassword(
    me: AuthUser,
    dto: ChangePasswordDto,
    currentSession?: string,
  ): Promise<void> {
    await this.signInLimit.assertNotLocked(me.email);
    const hash = await this.users.findPasswordHash(me.id);
    if (!hash) throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.WRONG_PASSWORD);
    const proven = me.mustChangePassword && dto.currentPassword === undefined;
    if (!proven) {
      if (!(await verifyPassword(dto.currentPassword ?? '', hash))) {
        await this.signInLimit.recordFailure(me.email);
        throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.WRONG_PASSWORD);
      }
      await this.signInLimit.clear(me.email);
    }
    if (await verifyPassword(dto.newPassword, hash)) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.SAME_PASSWORD);
    }
    const passwordHash = await hashPassword(dto.newPassword);
    // The new password and its entry commit together, in a transaction opened only now: the checks
    // above (and a wrong password's count and lockout entry) hold no connection meanwhile (gap 10).
    await this.afterCommit.inTransaction(async () => {
      const changedAt = new Date();
      await this.users.update(me.id, {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: changedAt,
      });
      await this.audit.record({
        action: 'core.user.change_password',
        entity: { type: AuditEntityType.USER, id: me.id, label: me.name },
      });
      // M3 / L2: every other sign-in ends in this transaction, with the new password; the one that
      // changed it stays. The event follows after the commit (logging, other listeners).
      await this.sessions.endOtherSessions(me.id, changedAt, currentSession);
      await this.endSessions(me.id, 'password_changed', currentSession);
    });
  }

  private async recordStatus(
    action: 'core.user.deactivate' | 'core.user.reactivate',
    before: UserAccount,
    after: UserAccount,
  ): Promise<UserAccount> {
    await this.audit.record({
      action,
      entity: this.entity(after),
      before: accountSnapshot(before),
      after: accountSnapshot(after),
    });
    return after;
  }

  /** After the commit, core/auth revokes the user's refresh tokens (a rollback ends nothing). */
  private async endSessions(
    userId: string,
    reason: UserSessionsEndedEvent['reason'],
    keepFamilyId?: string,
  ): Promise<void> {
    const event: UserSessionsEndedEvent = {
      userId,
      reason,
      at: new Date().toISOString(),
      ...(keepFamilyId ? { keepFamilyId } : {}),
    };
    // Fire-and-forget, after the commit.
    await this.events.publish(CoreEvent.USER_SESSIONS_ENDED, event);
  }

  /**
   * H1: a non-System-admin manages only users within their ceiling — never a System admin (403
   * `SYSTEM_ADMIN_ONLY`), never someone holding a grant beyond theirs (403 `GRANT_EXCEEDS_OWN`).
   */
  private async assertMayManage(target: UserAccount, ceiling: HeldGrants): Promise<void> {
    if (ceiling.isSystemAdmin) return;
    if (target.roles.some((r) => r.key === SYSTEM_ADMIN_ROLE)) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.SYSTEM_ADMIN_ONLY);
    }
    this.roles.assertWithinCeiling(ceiling, await this.roles.grantsOfRoles(target.roles.map((r) => r.id)));
  }

  /**
   * H1: a non-System-admin gives or takes away only roles within their ceiling — never the System
   * admin role (403 `SYSTEM_ADMIN_ONLY`), never one granting beyond theirs (403 `GRANT_EXCEEDS_OWN`).
   */
  private async assertMayAssign(roles: readonly RoleRef[], ceiling: HeldGrants): Promise<void> {
    if (ceiling.isSystemAdmin || roles.length === 0) return;
    if (roles.some((r) => r.key === SYSTEM_ADMIN_ROLE)) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.SYSTEM_ADMIN_ONLY);
    }
    this.roles.assertWithinCeiling(ceiling, await this.roles.grantsOfRoles(roles.map((r) => r.id)));
  }

  /**
   * H-1 (security review, owner 2026-11-23): only a System admin sets or changes an account's
   * employee record (403 `EMPLOYEE_LINK_ADMIN_ONLY`). A stage, team or self scope is anchored to the
   * linked employee, so choosing it chooses whose records the account reaches — and who it is for
   * "not your own penalty / pay line". Checking that the employee sits inside the actor's own scope
   * for every scoped grant would be the finer rule; linking is rare and admin work, so the simple one.
   */
  private assertMayLinkEmployee(ceiling: HeldGrants): void {
    if (!ceiling.isSystemAdmin) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.EMPLOYEE_LINK_ADMIN_ONLY);
    }
  }

  /**
   * The account `id`, after locking its row and its roles' rows (with `giving`, the roles about to be
   * given) until the transaction ends (L-6 / L1): the ceiling check reads those grants, so neither
   * the account's roles nor the roles' grants can change before the write.
   */
  private async lockTarget(id: string, giving: readonly string[] = []): Promise<UserAccount> {
    await this.users.lockUser(id);
    const user = await this.get(id);
    await this.roles.lockForGiving([...user.roles.map((r) => r.id), ...giving]);
    return user;
  }

  /**
   * M1 (third review, owner 2026-11-23): only a System admin gives a temporary password to, changes
   * the email of, or unlocks someone else's account that is linked to an employee record (403
   * `LINKED_ACCOUNT_ADMIN_ONLY`). The ceiling compares scope labels, not reach — a Primary head's
   * `own_stage` and the Prep head's look alike — so signing in as a linked account could reach what
   * it reaches. Unlinked accounts reach nobody through a stage, team or self scope, and can't act on
   * pay (M2).
   */
  private assertMayTakeOver(target: UserAccount, actor: Actor, ceiling: HeldGrants): void {
    if (ceiling.isSystemAdmin || actor?.id === target.id || !target.employee) return;
    throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.LINKED_ACCOUNT_ADMIN_ONLY);
  }

  /**
   * M2 (third review): a role acting on pay or penalties (`actsOnPay`) may go to an account only if
   * it is linked to its employee record — else "not your own line / penalty / pay" can't be checked.
   * A System admin may (they link accounts); anyone else → 403 `UNLINKED_PAY_ROLE`.
   */
  private async assertPayRolesLinked(
    roleIds: readonly string[],
    employeeId: string | null,
    ceiling: HeldGrants,
  ): Promise<void> {
    if (ceiling.isSystemAdmin || employeeId) return;
    if (actsOnPay(await this.roles.grantsOfRoles(roleIds))) {
      throw new CodedException(HttpStatus.FORBIDDEN, ErrorCode.UNLINKED_PAY_ROLE);
    }
  }

  private async row(id: string): Promise<UserAccountRow> {
    const row = await this.users.findAccount(id);
    if (!row) throw new NotFoundException('User not found');
    return row;
  }

  private async assertEmailFree(email: string, exceptId?: string): Promise<void> {
    const owner = await this.users.findIdByEmail(email);
    if (owner && owner !== exceptId) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.EMAIL_TAKEN);
    }
  }

  private async assertEmployeeFree(employeeId: string, exceptId?: string): Promise<void> {
    if (!(await this.users.employeeExists(employeeId))) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.UNKNOWN_EMPLOYEE);
    }
    const linked = await this.users.findIdByEmployee(employeeId);
    if (linked && linked !== exceptId) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.EMPLOYEE_ALREADY_LINKED);
    }
  }

  private entity(user: Pick<UserAccount, 'id' | 'name'>) {
    return { type: AuditEntityType.USER, id: user.id, label: user.name };
  }
}
