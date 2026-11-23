import { ErrorCode, PERMISSION_KEYS, type HeldGrants } from '@school-erp/shared';
import type { AuditService } from '../audit';
import type { PermissionsService } from '../permissions';
import type { RoleRow, RolesRepository } from './repositories/roles.repository';
import { RolesService } from './roles.service';

function row(overrides: Partial<RoleRow> = {}): RoleRow {
  return {
    id: 'r-1',
    key: 'custom_ab12cd34',
    nameEn: 'Nurse',
    nameAr: 'ممرضة',
    builtIn: false,
    permissions: [{ permissionKey: 'hr.employees.view', scope: 'own_stage' }],
    _count: { users: 0 },
    ...overrides,
  };
}

function makeService(
  found: RoleRow = row(),
  opts: { otherAdmins?: number; held?: HeldGrants; heldByActor?: boolean; heldByAdmin?: boolean } = {},
) {
  let current = found;
  const repo = {
    findById: jest.fn(() => Promise.resolve(current)),
    lockRole: jest.fn(() => Promise.resolve()),
    replaceGrants: jest.fn((_id: string, grants: RoleRow['permissions']) => {
      current = { ...current, permissions: grants };
      return Promise.resolve();
    }),
    updateNames: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(() => Promise.resolve('r-new')),
    findRefsByIds: jest.fn(),
    lockSystemAdminRole: jest.fn(() => Promise.resolve()),
    countOtherActiveSystemAdmins: jest.fn(() => Promise.resolve(opts.otherAdmins ?? 0)),
    isHeldBy: jest.fn(() => Promise.resolve(opts.heldByActor ?? false)),
    isHeldBySystemAdmin: jest.fn(() => Promise.resolve(opts.heldByAdmin ?? false)),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const permissions = { heldGrants: jest.fn(() => Promise.resolve(opts.held ?? { isSystemAdmin: true, grants: [] })) };
  const service = new RolesService(
    repo as unknown as RolesRepository,
    audit as unknown as AuditService,
    permissions as unknown as PermissionsService,
  );
  return { service, repo, audit };
}

describe('RolesService', () => {
  it('a role shows its permissions in registry order; unknown stored keys are left out (edge case 8)', async () => {
    const { service } = makeService(
      row({
        permissions: [
          { permissionKey: 'hr.penalties.record', scope: 'own_team' },
          { permissionKey: 'hr.gone.away', scope: 'all' },
          { permissionKey: 'hr.employees.view', scope: 'own_team' },
        ],
      }),
    );
    expect((await service.get('r-1')).permissions).toEqual([
      { key: 'hr.employees.view', scope: 'own_team' },
      { key: 'hr.penalties.record', scope: 'own_team' },
    ]);
  });

  it('the System admin shows every key with scope all', async () => {
    const { service } = makeService(row({ key: 'system_admin', builtIn: true, permissions: [] }));
    const role = await service.get('r-1');
    expect(role.permissions.map((p) => p.key)).toEqual(PERMISSION_KEYS);
  });

  it('editing permissions replaces the set and records the change', async () => {
    const { service, repo, audit } = makeService();
    const role = await service.update('r-1', {
      permissions: [{ key: 'hr.employees.view', scope: 'all' }],
    });
    expect(repo.replaceGrants).toHaveBeenCalledWith('r-1', [
      { permissionKey: 'hr.employees.view', scope: 'all' },
    ]);
    expect(role.permissions).toEqual([{ key: 'hr.employees.view', scope: 'all' }]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'core.role.update',
        entity: { type: 'role', id: 'r-1', label: { en: 'Nurse', ar: 'ممرضة' } },
        before: expect.objectContaining({ permissions: { 'hr.employees.view': 'own_stage' } }),
        after: expect.objectContaining({ permissions: { 'hr.employees.view': 'all' } }),
      }),
    );
  });

  it('a duplicated permission → DUPLICATE_PERMISSION', async () => {
    const { service, repo } = makeService();
    await expect(
      service.update('r-1', {
        permissions: [
          { key: 'hr.employees.view', scope: 'all' },
          { key: 'hr.employees.view', scope: 'self' },
        ],
      }),
    ).rejects.toMatchObject({ code: ErrorCode.DUPLICATE_PERMISSION });
    expect(repo.replaceGrants).not.toHaveBeenCalled();
  });

  it('a whole-school permission can only cover everyone → INVALID_SCOPE (P3)', async () => {
    const { service, repo } = makeService();
    await expect(
      service.update('r-1', { permissions: [{ key: 'hr.payroll.approve', scope: 'own_stage' }] }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_SCOPE });
    await expect(
      service.create({
        nameEn: 'Desk',
        nameAr: 'مكتب',
        permissions: [{ key: 'core.settings.view', scope: 'self' }],
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_SCOPE });
    expect(repo.replaceGrants).not.toHaveBeenCalled();
    // Row-level ones take any scope.
    await expect(
      service.update('r-1', { permissions: [{ key: 'hr.penalties.view', scope: 'own_team' }] }),
    ).resolves.toBeDefined();
  });

  it('the System admin’s permissions can’t be changed (R8); its names can', async () => {
    const { service, repo } = makeService(row({ key: 'system_admin', builtIn: true }));
    await expect(service.update('r-1', { permissions: [] })).rejects.toMatchObject({
      code: ErrorCode.SYSTEM_ADMIN_FIXED,
    });
    await service.update('r-1', { nameEn: 'Administrator' });
    expect(repo.updateNames).toHaveBeenCalledWith('r-1', {
      nameEn: 'Administrator',
      nameAr: undefined,
    });
  });

  it('the System admin can’t be deleted, even unused (owner 2026-11-19)', async () => {
    const { service, repo, audit } = makeService(row({ key: 'system_admin', builtIn: true }));
    await expect(service.remove('r-1')).rejects.toMatchObject({
      code: ErrorCode.SYSTEM_ADMIN_UNDELETABLE,
    });
    expect(repo.delete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a held role can’t be deleted, starting or custom → ROLE_IN_USE', async () => {
    for (const builtIn of [true, false]) {
      const { service, repo } = makeService(row({ builtIn, _count: { users: 2 } }));
      await expect(service.remove('r-1')).rejects.toMatchObject({ code: ErrorCode.ROLE_IN_USE });
      expect(repo.delete).not.toHaveBeenCalled();
    }
  });

  it('an unused role is deleted and recorded — a starting role too (owner 2026-11-19)', async () => {
    for (const builtIn of [true, false]) {
      const { service, repo, audit } = makeService(row({ key: 'hr_officer', builtIn }));
      await service.remove('r-1');
      expect(repo.delete).toHaveBeenCalledWith('r-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'core.role.delete',
          before: expect.objectContaining({ key: 'hr_officer' }),
        }),
      );
    }
  });

  it('edge case 5 — the last-admin check locks the role row, then refuses when nobody else is left', async () => {
    const { service, repo } = makeService();
    await expect(service.assertAnotherSystemAdmin('u-1')).rejects.toMatchObject({
      code: ErrorCode.LAST_SYSTEM_ADMIN,
    });
    expect(repo.lockSystemAdminRole).toHaveBeenCalled();
    expect(repo.countOtherActiveSystemAdmins).toHaveBeenCalledWith('u-1');
    await expect(
      makeService(row(), { otherAdmins: 1 }).service.assertAnotherSystemAdmin('u-1'),
    ).resolves.toBeUndefined();
  });

  describe('H2 — core.roles.manage has a ceiling (security review, owner 2026-11-23)', () => {
    const me = { id: 'u-me' };
    const held: HeldGrants = {
      isSystemAdmin: false,
      grants: [
        { key: 'core.roles.manage', scope: 'all' },
        { key: 'hr.employees.view', scope: 'own_stage' },
      ],
    };

    it('creating a role with a key the actor lacks, or wider than theirs → 403 GRANT_EXCEEDS_OWN; within → created', async () => {
      const { service, repo } = makeService(row(), { held });
      for (const permissions of [
        [{ key: 'hr.payroll.approve' as const, scope: 'all' as const }],
        [{ key: 'hr.employees.view' as const, scope: 'all' as const }],
        [{ key: 'hr.employees.view' as const, scope: 'own_team' as const }],
      ]) {
        await expect(service.create({ nameEn: 'X', nameAr: 'س', permissions }, me)).rejects.toMatchObject({
          code: ErrorCode.GRANT_EXCEEDS_OWN,
        });
      }
      expect(repo.create).not.toHaveBeenCalled();
      await service.create({ nameEn: 'X', nameAr: 'س', permissions: [{ key: 'hr.employees.view', scope: 'self' }] }, me);
      expect(repo.create).toHaveBeenCalled();
    });

    it('editing a role the actor holds → 403 ROLE_HELD_BY_YOU, names included', async () => {
      const { service, repo } = makeService(row(), { held, heldByActor: true });
      await expect(service.update('r-1', { nameEn: 'Renamed' }, me)).rejects.toMatchObject({
        code: ErrorCode.ROLE_HELD_BY_YOU,
      });
      expect(repo.updateNames).not.toHaveBeenCalled();
    });

    it('editing a role a System admin holds, or the System admin role → 403 ROLE_HELD_BY_SYSTEM_ADMIN', async () => {
      await expect(
        makeService(row(), { held, heldByAdmin: true }).service.update('r-1', { nameEn: 'X' }, me),
      ).rejects.toMatchObject({ code: ErrorCode.ROLE_HELD_BY_SYSTEM_ADMIN });
      await expect(
        makeService(row({ key: 'system_admin', builtIn: true }), { held }).service.update('r-1', { nameEn: 'X' }, me),
      ).rejects.toMatchObject({ code: ErrorCode.ROLE_HELD_BY_SYSTEM_ADMIN });
    });

    it('editing permissions beyond the ceiling → 403 GRANT_EXCEEDS_OWN, nothing replaced', async () => {
      const { service, repo } = makeService(row(), { held });
      await expect(
        service.update('r-1', { permissions: [{ key: 'core.users.manage', scope: 'all' }] }, me),
      ).rejects.toMatchObject({ code: ErrorCode.GRANT_EXCEEDS_OWN });
      expect(repo.replaceGrants).not.toHaveBeenCalled();
    });

    it('a System admin (or the system itself) has no ceiling', async () => {
      const { service, repo } = makeService(row(), { held: { isSystemAdmin: true, grants: [] }, heldByActor: true });
      await service.update('r-1', { permissions: [{ key: 'core.users.manage', scope: 'all' }] }, me);
      expect(repo.replaceGrants).toHaveBeenCalled();
      // A signed-in System admin (not the system): their ceiling is read, and it is none.
      const system = makeService(row(), { held: { isSystemAdmin: true, grants: [] } });
      await system.service.create(
        { nameEn: 'X', nameAr: 'س', permissions: [{ key: 'core.users.manage', scope: 'all' }] },
        me,
      );
      expect(system.repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ grants: [{ permissionKey: 'core.users.manage', scope: 'all' }] }),
      );
    });

    it('L-4 — removing a grant beyond the ceiling (or keeping one in a renamed role) is refused too', async () => {
      const strong = row({ permissions: [{ permissionKey: 'hr.payroll.approve', scope: 'all' }] });
      const { service, repo } = makeService(strong, { held });
      // Taking "approve payroll" away from its holders is beyond someone who doesn't hold it.
      await expect(service.update('r-1', { permissions: [] }, me)).rejects.toMatchObject({ code: ErrorCode.GRANT_EXCEEDS_OWN });
      await expect(service.update('r-1', { nameEn: 'Renamed' }, me)).rejects.toMatchObject({ code: ErrorCode.GRANT_EXCEEDS_OWN });
      expect(repo.replaceGrants).not.toHaveBeenCalled();
      expect(repo.updateNames).not.toHaveBeenCalled();
    });

    it('L-4 — deleting a role beyond the ceiling is refused; within it, deleted', async () => {
      const strong = makeService(row({ permissions: [{ permissionKey: 'hr.payroll.approve', scope: 'all' }] }), { held });
      await expect(strong.service.remove('r-1', me)).rejects.toMatchObject({ code: ErrorCode.GRANT_EXCEEDS_OWN });
      expect(strong.repo.delete).not.toHaveBeenCalled();
      const within = makeService(row(), { held });
      await within.service.remove('r-1', me);
      expect(within.repo.delete).toHaveBeenCalledWith('r-1');
    });

    it('L-6 — an edit or a delete locks the role before its checks', async () => {
      const { service, repo } = makeService(row(), { held });
      await service.update('r-1', { nameEn: 'X' }, me);
      expect(repo.lockRole.mock.invocationCallOrder[0]).toBeLessThan(repo.isHeldBy.mock.invocationCallOrder[0]);
      await service.remove('r-1', me);
      expect(repo.lockRole).toHaveBeenCalledTimes(2);
    });
  });
});
