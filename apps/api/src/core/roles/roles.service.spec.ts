import { ErrorCode, PERMISSION_KEYS } from '@school-erp/shared';
import type { AuditService } from '../audit';
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

function makeService(found: RoleRow = row(), opts: { otherAdmins?: number } = {}) {
  let current = found;
  const repo = {
    findById: jest.fn(() => Promise.resolve(current)),
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
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const service = new RolesService(
    repo as unknown as RolesRepository,
    audit as unknown as AuditService,
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
});
