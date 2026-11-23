import {
  CoreEvent,
  ErrorCode,
  firstGrantOverCeiling,
  type AuthUser,
  type HeldGrants,
  type RoleGrant,
  type RoleRef,
} from '@school-erp/shared';
import { hashPassword } from '../../common/utils/password.util';
import type { AfterCommit } from '../../database/transactions';
import type { AuditService } from '../audit';
import type { DomainEvents } from '../events';
import type { RolesService } from '../roles';
import type { SignInLimitService } from '../sign-in-limit';
import type { UserAccountRow, UsersRepository } from './repositories/users.repository';
import type { SessionRevocation } from './session-revocation';
import { UserAccountsService } from './user-accounts.service';
import { accountSnapshot, toUserAccount } from './users.pure';

const ADMIN: RoleRef = { id: 'r-admin', key: 'system_admin', nameEn: 'System admin', nameAr: 'م' };
const HR: RoleRef = { id: 'r-hr', key: 'hr_manager', nameEn: 'HR manager', nameAr: 'م' };
const OFFICER: RoleRef = { id: 'r-off', key: 'hr_officer', nameEn: 'HR officer', nameAr: 'م' };
const HR_GRANTS: RoleGrant[] = [
  { key: 'hr.employees.view', scope: 'all' },
  { key: 'hr.payroll.approve', scope: 'all' },
];
const OFFICER_GRANTS: RoleGrant[] = [{ key: 'hr.employees.view', scope: 'all' }];
/** A role acting on pay (M2): entering lateness. */
const CLERK: RoleRef = { id: 'r-clerk', key: 'custom_clerk', nameEn: 'Lateness clerk', nameAr: 'م' };
const CLERK_GRANTS: RoleGrant[] = [{ key: 'hr.lateness.edit', scope: 'all' }];
const LINKED = { id: 'e-5', code: 'EMP-0005', nameEn: 'Prep Head', nameAr: 'رئيس', photoUrl: null, gender: 'MALE' as const };
/** A user manager who isn't a System admin: holds what an officer holds, plus managing users. */
const MANAGER: HeldGrants = {
  isSystemAdmin: false,
  grants: [{ key: 'core.users.manage', scope: 'all' }, ...OFFICER_GRANTS],
};

function row(overrides: Partial<UserAccountRow> = {}): UserAccountRow {
  return {
    id: 'u-1',
    name: 'Mona',
    email: 'mona@school.test',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date('2026-11-17T10:00:00Z'),
    lastSignInAt: null,
    passwordChangedAt: null,
    linkedEmployee: null,
    roles: [{ role: ADMIN }, { role: HR }],
    ...overrides,
  };
}

function makeService(
  start: UserAccountRow = row(),
  opts: { otherAdmins?: number; lockedUntil?: Date; held?: HeldGrants } = {},
) {
  let current = start;
  let lockedUntil = opts.lockedUntil;
  const users = {
    findAccount: jest.fn(() => Promise.resolve(current)),
    lockUser: jest.fn(() => Promise.resolve()),
    update: jest.fn((_id: string, data: Partial<UserAccountRow>) => {
      current = { ...current, ...data };
      return Promise.resolve();
    }),
    findIdByEmail: jest.fn(() => Promise.resolve(null)),
    findIdByEmployee: jest.fn(() => Promise.resolve(null)),
    employeeExists: jest.fn(() => Promise.resolve(true)),
    findPasswordHash: jest.fn(),
    create: jest.fn(),
  };
  const roles = {
    lockForGiving: jest.fn(() => Promise.resolve()),
    // The System admin (or the system itself) unless `opts.held` says otherwise (H1).
    ceilingOf: jest.fn(() => Promise.resolve(opts.held ?? { isSystemAdmin: true, grants: [] })),
    assertWithinCeiling: jest.fn((held: HeldGrants, grants: RoleGrant[]) => {
      if (firstGrantOverCeiling(held, grants)) {
        throw Object.assign(new Error('over'), { code: ErrorCode.GRANT_EXCEEDS_OWN });
      }
    }),
    grantsOfRoles: jest.fn((ids: string[]) =>
      Promise.resolve(
        ids.flatMap((id) =>
          id === HR.id ? HR_GRANTS : id === OFFICER.id ? OFFICER_GRANTS : id === CLERK.id ? CLERK_GRANTS : [],
        ),
      ),
    ),
    refsByIds: jest.fn((ids: string[]) =>
      Promise.resolve([ADMIN, HR, OFFICER, CLERK].filter((r) => ids.includes(r.id))),
    ),
    setRolesOf: jest.fn((_id: string, ids: string[]) => {
      current = {
        ...current,
        roles: [ADMIN, HR, OFFICER, CLERK].filter((r) => ids.includes(r.id)).map((role) => ({ role })),
      };
      return Promise.resolve();
    }),
    assertAnotherSystemAdmin: jest.fn(() =>
      (opts.otherAdmins ?? 0) > 0
        ? Promise.resolve()
        : Promise.reject(Object.assign(new Error('last'), { code: ErrorCode.LAST_SYSTEM_ADMIN })),
    ),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  /** Events published (DomainEvents sends them after the commit — its own spec). */
  const queued: unknown[][] = [];
  /** Whether the code runs inside `afterCommit.inTransaction` right now. */
  const tx = { open: false, seen: [] as string[] };
  const afterCommit = {
    inTransaction: jest.fn(async (fn: () => Promise<unknown>) => {
      tx.open = true;
      try {
        return await fn();
      } finally {
        tx.open = false;
      }
    }),
  };
  const events = {
    publish: jest.fn((...args: unknown[]) => {
      queued.push(args);
      return Promise.resolve();
    }),
  };
  /** Ends the other sign-ins inside the transaction (L2): records whether it ran inside one. */
  const sessions = {
    endOtherSessions: jest.fn(() => {
      tx.seen.push(tx.open ? 'sessions ended in a transaction' : 'sessions ended outside a transaction');
      return Promise.resolve();
    }),
  };
  const signInLimit = {
    lockedUntil: jest.fn((emails: string[]) =>
      Promise.resolve(new Map(lockedUntil ? emails.map((e) => [e, lockedUntil as Date]) : [])),
    ),
    unlock: jest.fn(() => {
      const was = lockedUntil !== undefined;
      lockedUntil = undefined;
      return Promise.resolve(was);
    }),
    assertNotLocked: jest.fn(() =>
      lockedUntil
        ? Promise.reject(Object.assign(new Error('locked'), { code: ErrorCode.TOO_MANY_ATTEMPTS }))
        : Promise.resolve(),
    ),
    recordFailure: jest.fn(() => {
      tx.seen.push(tx.open ? 'failure in a transaction' : 'failure outside a transaction');
      return Promise.resolve();
    }),
    clear: jest.fn(() => Promise.resolve()),
  };
  const service = new UserAccountsService(
    users as unknown as UsersRepository,
    roles as unknown as RolesService,
    audit as unknown as AuditService,
    afterCommit as unknown as AfterCommit,
    events as unknown as DomainEvents,
    signInLimit as unknown as SignInLimitService,
    sessions as unknown as SessionRevocation,
  );
  return { service, users, roles, audit, queued, events, signInLimit, afterCommit, tx, sessions };
}

describe('UserAccountsService', () => {
  it('edge case 5 — removing the last System admin’s role is refused, nothing written or recorded', async () => {
    const { service, roles, users, audit } = makeService();
    await expect(service.update('u-1', { roleIds: [HR.id] })).rejects.toMatchObject({
      code: ErrorCode.LAST_SYSTEM_ADMIN,
    });
    expect(roles.setRolesOf).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('edge case 5 — deactivating the last System admin is refused', async () => {
    const { service, users } = makeService();
    await expect(service.deactivate('u-1')).rejects.toMatchObject({
      code: ErrorCode.LAST_SYSTEM_ADMIN,
    });
    expect(users.update).not.toHaveBeenCalled();
  });

  it('with another active System admin, the role can go and the user can be deactivated', async () => {
    const { service, audit } = makeService(row(), { otherAdmins: 1 });
    const updated = await service.update('u-1', { roleIds: [HR.id] });
    expect(updated.roles.map((r) => r.key)).toEqual(['hr_manager']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'core.user.update',
        before: expect.objectContaining({ roles: ['hr_manager', 'system_admin'] }),
        after: expect.objectContaining({ roles: ['hr_manager'] }),
      }),
    );
  });

  it('a user who is not a System admin is never checked against the last-admin rule', async () => {
    const { service, roles } = makeService(row({ roles: [{ role: HR }] }));
    await service.deactivate('u-1');
    expect(roles.assertAnotherSystemAdmin).not.toHaveBeenCalled();
  });

  it('edge case 6 — deactivating ends the user’s sessions, only after the commit', async () => {
    const { service, users, queued, events, audit } = makeService(row(), { otherAdmins: 1 });
    const result = await service.deactivate('u-1');
    expect(result.isActive).toBe(false);
    // The cut-off moves too: access tokens from before stay dead after a reactivation.
    expect(users.update).toHaveBeenCalledWith('u-1', { isActive: false, sessionsValidAfter: expect.any(Date) });
    // Fire-and-forget: DomainEvents holds it until the commit.
    expect(queued).toHaveLength(1);
    expect(events.publish).toHaveBeenCalledWith(
      CoreEvent.USER_SESSIONS_ENDED,
      expect.objectContaining({ userId: 'u-1', reason: 'deactivated' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'core.user.deactivate',
        before: expect.objectContaining({ status: 'active' }),
        after: expect.objectContaining({ status: 'inactive' }),
      }),
    );
  });

  it('a temporary password: flagged to change, sessions end, the log holds no password', async () => {
    const { service, users, queued, audit } = makeService();
    await service.setTemporaryPassword('u-1', 'temporary-secret-1');
    const data = users.update.mock.calls[0]?.[1] as { passwordHash: string };
    expect(data).toMatchObject({ mustChangePassword: true });
    expect(data.passwordHash).not.toContain('temporary-secret-1');
    expect(queued).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.user.set_password',
      entity: { type: 'user', id: 'u-1', label: 'Mona' },
    });
  });

  it('change own password: a wrong current password → WRONG_PASSWORD, nothing written', async () => {
    const { service, users } = makeService();
    users.findPasswordHash.mockResolvedValue(await hashPassword('the-right-one', 4));
    const me = { id: 'u-1', name: 'Mona' } as AuthUser;
    await expect(
      service.changeOwnPassword(me, { currentPassword: 'wrong', newPassword: 'new-password-1' }),
    ).rejects.toMatchObject({ code: ErrorCode.WRONG_PASSWORD });
    expect(users.update).not.toHaveBeenCalled();

    await service.changeOwnPassword(me, {
      currentPassword: 'the-right-one',
      newPassword: 'new-password-1',
    });
    expect(users.update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ mustChangePassword: false }),
    );
  });

  it('gap 10 — a wrong current password is counted outside any transaction; the new password and its entry are written in one', async () => {
    const { service, users, audit, afterCommit, tx } = makeService();
    users.findPasswordHash.mockResolvedValue(await hashPassword('the-right-one', 4));
    const me = { id: 'u-1', name: 'Mona' } as AuthUser;
    await expect(
      service.changeOwnPassword(me, { currentPassword: 'wrong', newPassword: 'new-password-1' }),
    ).rejects.toMatchObject({ code: ErrorCode.WRONG_PASSWORD });
    expect(tx.seen).toEqual(['failure outside a transaction']);
    expect(afterCommit.inTransaction).not.toHaveBeenCalled();

    const order: string[] = [];
    users.update.mockImplementation(() => (order.push(tx.open ? 'update in tx' : 'update'), Promise.resolve()));
    audit.record.mockImplementation(() => (order.push(tx.open ? 'audit in tx' : 'audit'), Promise.resolve()));
    await service.changeOwnPassword(me, { currentPassword: 'the-right-one', newPassword: 'new-password-1' });
    expect(afterCommit.inTransaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['update in tx', 'audit in tx']);
  });

  it('change own password: no current password without a temporary one → WRONG_PASSWORD', async () => {
    const { service, users } = makeService();
    users.findPasswordHash.mockResolvedValue(await hashPassword('the-right-one', 4));
    const me = { id: 'u-1', name: 'Mona', mustChangePassword: false } as AuthUser;
    await expect(
      service.changeOwnPassword(me, { newPassword: 'new-password-1' }),
    ).rejects.toMatchObject({ code: ErrorCode.WRONG_PASSWORD });
    expect(users.update).not.toHaveBeenCalled();
  });

  it('after a temporary password (P3): the new one alone is enough, and the flag is cleared', async () => {
    const { service, users } = makeService();
    users.findPasswordHash.mockResolvedValue(await hashPassword('temporary-1234', 4));
    const me = { id: 'u-1', name: 'Mona', mustChangePassword: true } as AuthUser;
    await service.changeOwnPassword(me, { newPassword: 'my-own-password' });
    expect(users.update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ mustChangePassword: false, passwordChangedAt: expect.any(Date) }),
    );
  });

  it('the new password can’t be the one in use (the temporary one) → SAME_PASSWORD', async () => {
    const { service, users } = makeService();
    users.findPasswordHash.mockResolvedValue(await hashPassword('temporary-1234', 4));
    const me = { id: 'u-1', name: 'Mona', mustChangePassword: true } as AuthUser;
    await expect(
      service.changeOwnPassword(me, { newPassword: 'temporary-1234' }),
    ).rejects.toMatchObject({ code: ErrorCode.SAME_PASSWORD });
    expect(users.update).not.toHaveBeenCalled();
  });

  it('a temporary password but a wrong current one sent anyway → WRONG_PASSWORD', async () => {
    const { service, users } = makeService();
    users.findPasswordHash.mockResolvedValue(await hashPassword('temporary-1234', 4));
    const me = { id: 'u-1', name: 'Mona', mustChangePassword: true } as AuthUser;
    await expect(
      service.changeOwnPassword(me, { currentPassword: 'nope', newPassword: 'my-own-password' }),
    ).rejects.toMatchObject({ code: ErrorCode.WRONG_PASSWORD });
  });

  it('a taken email → EMAIL_TAKEN; a linked employee → EMPLOYEE_ALREADY_LINKED', async () => {
    const { service, users } = makeService();
    users.findIdByEmail.mockResolvedValueOnce('u-2' as never);
    await expect(service.update('u-1', { email: 'other@school.test' })).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
    });
    users.findIdByEmployee.mockResolvedValueOnce('u-2' as never);
    await expect(service.update('u-1', { employeeId: 'e-1' })).rejects.toMatchObject({
      code: ErrorCode.EMPLOYEE_ALREADY_LINKED,
    });
    users.employeeExists.mockResolvedValueOnce(false);
    await expect(service.update('u-1', { employeeId: 'e-9' })).rejects.toMatchObject({
      code: ErrorCode.UNKNOWN_EMPLOYEE,
    });
  });

  describe('sign-in limit (owner 2026-11-18)', () => {
    const LOCKED_UNTIL = new Date('2026-11-18T10:15:00Z');
    const me = { id: 'u-1', name: 'Mona', email: 'mona@school.test' } as AuthUser;

    it('a locked account: the password change is refused before any password is checked', async () => {
      const { service, users, signInLimit } = makeService(row(), { lockedUntil: LOCKED_UNTIL });
      await expect(
        service.changeOwnPassword(me, { currentPassword: 'x', newPassword: 'new-password-1' }),
      ).rejects.toMatchObject({ code: ErrorCode.TOO_MANY_ATTEMPTS });
      expect(users.findPasswordHash).not.toHaveBeenCalled();
      expect(signInLimit.recordFailure).not.toHaveBeenCalled();
    });

    it('the forced new-password path is refused while locked too', async () => {
      const { service, users } = makeService(row(), { lockedUntil: LOCKED_UNTIL });
      await expect(
        service.changeOwnPassword({ ...me, mustChangePassword: true }, { newPassword: 'mine-1234567' }),
      ).rejects.toMatchObject({ code: ErrorCode.TOO_MANY_ATTEMPTS });
      expect(users.update).not.toHaveBeenCalled();
    });

    it('a wrong current password counts as a wrong sign-in; a right one clears the count', async () => {
      const { service, users, signInLimit } = makeService();
      users.findPasswordHash.mockResolvedValue(await hashPassword('the-right-one', 4));
      await expect(
        service.changeOwnPassword(me, { currentPassword: 'wrong', newPassword: 'new-password-1' }),
      ).rejects.toMatchObject({ code: ErrorCode.WRONG_PASSWORD });
      expect(signInLimit.recordFailure).toHaveBeenCalledWith('mona@school.test');
      expect(signInLimit.clear).not.toHaveBeenCalled();

      await service.changeOwnPassword(me, { currentPassword: 'the-right-one', newPassword: 'new-password-1' });
      expect(signInLimit.clear).toHaveBeenCalledWith('mona@school.test');
    });

    it('the account shows when its lock ends', async () => {
      const { service } = makeService(row(), { lockedUntil: LOCKED_UNTIL });
      await expect(service.get('u-1')).resolves.toMatchObject({
        lockedUntil: LOCKED_UNTIL.toISOString(),
      });
    });

    it('unlock: the lock goes and the change is recorded', async () => {
      const { service, audit, signInLimit } = makeService(row(), { lockedUntil: LOCKED_UNTIL });
      const after = await service.unlockSignIn('u-1');
      expect(after.lockedUntil).toBeNull();
      expect(signInLimit.unlock).toHaveBeenCalledWith('mona@school.test');
      expect(audit.record).toHaveBeenCalledWith({
        action: 'core.user.unlock_sign_in',
        entity: { type: 'user', id: 'u-1', label: 'Mona' },
        before: { lockedUntil: LOCKED_UNTIL.toISOString() },
        after: { lockedUntil: null },
      });
    });

    it('unlock of an account that was not locked records no change (before = after)', async () => {
      const { service, audit } = makeService();
      await service.unlockSignIn('u-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ before: { lockedUntil: null }, after: { lockedUntil: null } }),
      );
    });
  });

  describe('H1 — core.users.manage has a ceiling (security review, owner 2026-11-23)', () => {
    const me = { id: 'u-me' };
    const officer = () => row({ id: 'u-2', roles: [{ role: OFFICER }] });

    it('a non-System-admin can’t touch a System admin: edit, reset, deactivate, reactivate → 403 SYSTEM_ADMIN_ONLY', async () => {
      const { service, users, queued } = makeService(row(), { held: MANAGER, otherAdmins: 1 });
      for (const attempt of [
        () => service.update('u-1', { name: 'X' }, me),
        () => service.setTemporaryPassword('u-1', 'temporary-1234', me),
        () => service.deactivate('u-1', me),
        () => service.reactivate('u-1', me),
      ]) {
        await expect(attempt()).rejects.toMatchObject({ code: ErrorCode.SYSTEM_ADMIN_ONLY });
      }
      expect(users.update).not.toHaveBeenCalled();
      expect(queued).toHaveLength(0);
    });

    it('a non-System-admin can’t give the System admin role → 403 SYSTEM_ADMIN_ONLY', async () => {
      const { service, roles } = makeService(officer(), { held: MANAGER });
      await expect(service.update('u-2', { roleIds: [OFFICER.id, ADMIN.id] }, me)).rejects.toMatchObject({
        code: ErrorCode.SYSTEM_ADMIN_ONLY,
      });
      await expect(
        service.create({ name: 'N', email: 'n@school.test', password: 'password-123', roleIds: [ADMIN.id] }, me),
      ).rejects.toMatchObject({ code: ErrorCode.SYSTEM_ADMIN_ONLY });
      expect(roles.setRolesOf).not.toHaveBeenCalled();
    });

    it('a role stronger than the actor’s own → 403 GRANT_EXCEEDS_OWN; one within it is given', async () => {
      const { service, roles } = makeService(officer(), { held: MANAGER });
      await expect(service.update('u-2', { roleIds: [OFFICER.id, HR.id] }, me)).rejects.toMatchObject({
        code: ErrorCode.GRANT_EXCEEDS_OWN,
      });
      expect(roles.setRolesOf).not.toHaveBeenCalled();
      await service.update('u-2', { roleIds: [] }, me);
      expect(roles.setRolesOf).toHaveBeenCalledWith('u-2', []);
    });

    it('a user holding more than the actor can’t be reset or deactivated (no takeover of a stronger account)', async () => {
      const { service } = makeService(row({ id: 'u-3', roles: [{ role: HR }] }), { held: MANAGER });
      await expect(service.setTemporaryPassword('u-3', 'temporary-1234', me)).rejects.toMatchObject({
        code: ErrorCode.GRANT_EXCEEDS_OWN,
      });
      await expect(service.deactivate('u-3', me)).rejects.toMatchObject({ code: ErrorCode.GRANT_EXCEEDS_OWN });
    });

    it('nobody — a System admin included — changes their own roles → 403 OWN_ACCESS_CHANGE; a System admin may link their own employee', async () => {
      const { service, roles, users } = makeService();
      const self = { id: 'u-1' };
      await expect(service.update('u-1', { roleIds: [ADMIN.id] }, self)).rejects.toMatchObject({
        code: ErrorCode.OWN_ACCESS_CHANGE,
      });
      expect(roles.setRolesOf).not.toHaveBeenCalled();
      expect(users.update).not.toHaveBeenCalled();
      // The same roles and no employee change (the form sends them back): the rest saves.
      await service.update('u-1', { name: 'Mona B', roleIds: [HR.id, ADMIN.id], employeeId: null }, self);
      expect(users.update).toHaveBeenCalled();
      // A (sole) System admin links themselves: they reach everyone already (no lock-out at setup).
      await service.update('u-1', { employeeId: 'e-9' }, self);
      expect(users.update).toHaveBeenLastCalledWith('u-1', expect.objectContaining({ employeeId: 'e-9' }));
    });

    it('…but a non-System-admin can’t change their own employee link (OWN_ACCESS_CHANGE)', async () => {
      const { service } = makeService(row({ id: 'u-me', roles: [{ role: OFFICER }] }), { held: MANAGER });
      await expect(service.update('u-me', { employeeId: 'e-9' }, { id: 'u-me' })).rejects.toMatchObject({
        code: ErrorCode.OWN_ACCESS_CHANGE,
      });
    });

    it('H-1 — only a System admin sets or changes an employee link (create and update) → 403 EMPLOYEE_LINK_ADMIN_ONLY', async () => {
      const { service, users } = makeService(row({ id: 'u-2', roles: [{ role: OFFICER }] }), { held: MANAGER });
      await expect(
        service.create({ name: 'N', email: 'n@school.test', password: 'password-123', roleIds: [], employeeId: 'e-9' }, me),
      ).rejects.toMatchObject({ code: ErrorCode.EMPLOYEE_LINK_ADMIN_ONLY });
      await expect(service.update('u-2', { employeeId: 'e-9' }, me)).rejects.toMatchObject({
        code: ErrorCode.EMPLOYEE_LINK_ADMIN_ONLY,
      });
      await expect(service.update('u-2', { employeeId: null }, me)).resolves.toBeDefined();
      expect(users.create).not.toHaveBeenCalled();
    });

    it('M-1 — unlocking a sign-in has the same ceiling: a System admin → 403 SYSTEM_ADMIN_ONLY, a stronger user → 403 GRANT_EXCEEDS_OWN', async () => {
      const admin = makeService(row(), { held: MANAGER, lockedUntil: new Date('2026-11-17T11:00:00Z') });
      await expect(admin.service.unlockSignIn('u-1', me)).rejects.toMatchObject({ code: ErrorCode.SYSTEM_ADMIN_ONLY });
      expect(admin.signInLimit.unlock).not.toHaveBeenCalled();
      const stronger = makeService(row({ id: 'u-3', roles: [{ role: HR }] }), { held: MANAGER });
      await expect(stronger.service.unlockSignIn('u-3', me)).rejects.toMatchObject({ code: ErrorCode.GRANT_EXCEEDS_OWN });
      const within = makeService(row({ id: 'u-2', roles: [{ role: OFFICER }] }), { held: MANAGER });
      await within.service.unlockSignIn('u-2', me);
      expect(within.signInLimit.unlock).toHaveBeenCalled();
    });

    it('L-6 — every check on a user locks their row first (their roles can’t change under the check)', async () => {
      const { service, users } = makeService(row(), { otherAdmins: 1 });
      await service.update('u-1', { name: 'X' }, me);
      await service.setTemporaryPassword('u-1', 'temporary-1234', me);
      await service.deactivate('u-1', me);
      await service.reactivate('u-1', me);
      await service.unlockSignIn('u-1', me);
      expect(users.lockUser).toHaveBeenCalledTimes(5);
      expect(users.lockUser.mock.invocationCallOrder[0]).toBeLessThan(users.findAccount.mock.invocationCallOrder[0]);
    });
  });

  describe('third review (owner 2026-11-23)', () => {
    const me = { id: 'u-me' };
    const linkedOfficer = () => row({ id: 'u-5', roles: [{ role: OFFICER }], linkedEmployee: LINKED });

    it('M1 — same scope, different link: a linked account can’t be reset, re-emailed or unlocked by a non-admin (LINKED_ACCOUNT_ADMIN_ONLY)', async () => {
      const { service, users, signInLimit } = makeService(linkedOfficer(), { held: MANAGER, lockedUntil: new Date('2026-11-17T11:00:00Z') });
      for (const attempt of [
        () => service.setTemporaryPassword('u-5', 'temporary-1234', me),
        () => service.update('u-5', { email: 'mine@school.test' }, me),
        () => service.unlockSignIn('u-5', me),
      ]) {
        await expect(attempt()).rejects.toMatchObject({ code: ErrorCode.LINKED_ACCOUNT_ADMIN_ONLY, status: 403 });
      }
      expect(users.update).not.toHaveBeenCalled();
      expect(signInLimit.unlock).not.toHaveBeenCalled();
      // Their name may still be edited; a System admin may do all three.
      await service.update('u-5', { name: 'Renamed' }, me);
      const admin = makeService(linkedOfficer());
      await admin.service.setTemporaryPassword('u-5', 'temporary-1234', me);
      await admin.service.update('u-5', { email: 'new@school.test' }, me);
    });

    it('M1 — an unlinked account within the ceiling can still be reset by a user manager', async () => {
      const { service, users } = makeService(row({ id: 'u-2', roles: [{ role: OFFICER }] }), { held: MANAGER });
      await service.setTemporaryPassword('u-2', 'temporary-1234', me);
      expect(users.update).toHaveBeenCalled();
    });

    it('M2-A — a non-admin can’t give an unlinked account a role acting on pay (UNLINKED_PAY_ROLE), on create or update', async () => {
      const held: HeldGrants = { isSystemAdmin: false, grants: [...MANAGER.grants, ...CLERK_GRANTS] };
      const { service, roles } = makeService(row({ id: 'u-2', roles: [{ role: OFFICER }] }), { held });
      await expect(
        service.create({ name: 'N', email: 'n@school.test', password: 'password-123', roleIds: [CLERK.id] }, me),
      ).rejects.toMatchObject({ code: ErrorCode.UNLINKED_PAY_ROLE });
      await expect(service.update('u-2', { roleIds: [OFFICER.id, CLERK.id] }, me)).rejects.toMatchObject({
        code: ErrorCode.UNLINKED_PAY_ROLE,
      });
      expect(roles.setRolesOf).not.toHaveBeenCalled();
      // Linked, it may be given; a System admin may give it anyway.
      const linked = makeService(linkedOfficer(), { held });
      await expect(linked.service.update('u-5', { roleIds: [OFFICER.id, CLERK.id] }, me)).resolves.toBeDefined();
      await expect(makeService(row({ id: 'u-2', roles: [] })).service.update('u-2', { roleIds: [CLERK.id] }, me)).resolves.toBeDefined();
    });

    it('L1 — the roles given are locked before their grants are read for the ceiling', async () => {
      const { service, roles } = makeService(row({ id: 'u-2', roles: [{ role: OFFICER }] }), { held: MANAGER });
      await service.update('u-2', { roleIds: [] }, me);
      expect(roles.lockForGiving).toHaveBeenCalledWith([OFFICER.id]); // held (taken away) and given (none)
      expect(roles.lockForGiving.mock.invocationCallOrder[0]).toBeLessThan(roles.grantsOfRoles.mock.invocationCallOrder[0]);
      await service.create({ name: 'N', email: 'n@school.test', password: 'password-123', roleIds: [OFFICER.id] }, me);
      expect(roles.lockForGiving).toHaveBeenLastCalledWith([OFFICER.id]);
    });

    it('L2 — a password change ends the other sign-ins inside its transaction, keeping the caller’s', async () => {
      const { service, users, sessions, tx } = makeService();
      users.findPasswordHash.mockResolvedValue(await hashPassword('the-right-one', 4));
      await service.changeOwnPassword({ id: 'u-1', name: 'Mona' } as AuthUser, { currentPassword: 'the-right-one', newPassword: 'new-password-1' }, 'fam-1');
      expect(sessions.endOtherSessions).toHaveBeenCalledWith('u-1', expect.any(Date), 'fam-1');
      expect(tx.seen).toContain('sessions ended in a transaction');
    });

    it('a deactivation and a reactivation move the session cut-off (old access tokens stay dead)', async () => {
      const { service, users } = makeService(row({ isActive: false }), { otherAdmins: 1 });
      await service.reactivate('u-1');
      expect(users.update).toHaveBeenCalledWith('u-1', { isActive: true, sessionsValidAfter: expect.any(Date) });
    });
  });

  it('M3 — a changed password ends the user’s other sign-ins, keeping the one that changed it', async () => {
    const { service, users, queued } = makeService();
    users.findPasswordHash.mockResolvedValue(await hashPassword('the-right-one', 4));
    const me = { id: 'u-1', name: 'Mona' } as AuthUser;
    await service.changeOwnPassword(me, { currentPassword: 'the-right-one', newPassword: 'new-password-1' }, 'fam-1');
    expect(queued).toEqual([
      [CoreEvent.USER_SESSIONS_ENDED, expect.objectContaining({ userId: 'u-1', reason: 'password_changed', keepFamilyId: 'fam-1' })],
    ]);
  });

  describe('fourth review', () => {
    it('L-b — a deactivation and a temporary password end every sign-in inside the transaction', async () => {
      const { service, sessions } = makeService(row(), { otherAdmins: 1 });
      await service.deactivate('u-1');
      expect(sessions.endOtherSessions).toHaveBeenCalledWith('u-1', expect.any(Date));
      const reset = makeService();
      await reset.service.setTemporaryPassword('u-1', 'temporary-1234');
      expect(reset.sessions.endOtherSessions).toHaveBeenCalledWith('u-1', expect.any(Date));
    });

    it('M2-C — the log names the linked employee and keeps its id', () => {
      const account = toUserAccount(row({ linkedEmployee: LINKED }));
      expect(accountSnapshot(account).employeeId).toEqual({
        id: 'e-5',
        nameEn: 'Prep Head · EMP-0005',
        nameAr: 'رئيس · EMP-0005',
      });
    });
  });
});
