import type { EventEmitter2 } from '@nestjs/event-emitter';
import { CoreEvent, ErrorCode, type AuthUser, type RoleRef } from '@school-erp/shared';
import { hashPassword } from '../../common/utils/password.util';
import type { AfterCommit } from '../../database/transactions';
import type { AuditService } from '../audit';
import type { RolesService } from '../roles';
import type { UserAccountRow, UsersRepository } from './repositories/users.repository';
import { UserAccountsService } from './user-accounts.service';

const ADMIN: RoleRef = { id: 'r-admin', key: 'system_admin', nameEn: 'System admin', nameAr: 'م' };
const HR: RoleRef = { id: 'r-hr', key: 'hr_manager', nameEn: 'HR manager', nameAr: 'م' };

function row(overrides: Partial<UserAccountRow> = {}): UserAccountRow {
  return {
    id: 'u-1',
    name: 'Mona',
    email: 'mona@school.test',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date('2026-11-17T10:00:00Z'),
    linkedEmployee: null,
    roles: [{ role: ADMIN }, { role: HR }],
    ...overrides,
  };
}

function makeService(start: UserAccountRow = row(), opts: { otherAdmins?: number } = {}) {
  let current = start;
  const users = {
    findAccount: jest.fn(() => Promise.resolve(current)),
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
    refsByIds: jest.fn((ids: string[]) =>
      Promise.resolve([ADMIN, HR].filter((r) => ids.includes(r.id))),
    ),
    setRolesOf: jest.fn((_id: string, ids: string[]) => {
      current = {
        ...current,
        roles: [ADMIN, HR].filter((r) => ids.includes(r.id)).map((role) => ({ role })),
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
  const queued: Array<() => unknown> = [];
  const afterCommit = {
    run: jest.fn((fn: () => unknown) => {
      queued.push(fn);
      return Promise.resolve();
    }),
  };
  const events = { emitAsync: jest.fn(() => Promise.resolve([])) };
  const service = new UserAccountsService(
    users as unknown as UsersRepository,
    roles as unknown as RolesService,
    audit as unknown as AuditService,
    afterCommit as unknown as AfterCommit,
    events as unknown as EventEmitter2,
  );
  return { service, users, roles, audit, queued, events };
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
    expect(users.update).toHaveBeenCalledWith('u-1', { isActive: false });
    // Queued for after the commit, not emitted inside the transaction.
    expect(events.emitAsync).not.toHaveBeenCalled();
    expect(queued).toHaveLength(1);
    await queued[0]();
    expect(events.emitAsync).toHaveBeenCalledWith(
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
});
