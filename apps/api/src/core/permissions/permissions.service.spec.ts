import { Logger } from '@nestjs/common';
import { PERMISSION_KEYS } from '@school-erp/shared';
import type { ClsService } from 'nestjs-cls';
import type { StoredGrant } from './grants.pure';
import { resolveGrants } from './grants.pure';
import { PermissionsService } from './permissions.service';
import type { GrantsRepository, UserLink } from './repositories/grants.repository';

const g = (roleKey: string, permissionKey: string | null, scope: string | null = 'all') => ({
  roleKey,
  permissionKey,
  scope,
});

/** A fake request context: `newRequest()` starts the next request (a fresh store). */
function fakeCls() {
  let store = new Map<unknown, unknown>();
  let active = true;
  const cls = {
    isActive: () => active,
    get: (k: unknown) => store.get(k),
    set: (k: unknown, v: unknown) => store.set(k, v),
  };
  return {
    cls: cls as unknown as ClsService,
    newRequest: () => {
      store = new Map();
    },
    outsideRequest: () => {
      active = false;
    },
  };
}

function makeService(rows: StoredGrant[], link: UserLink = { employeeId: 'e-1', stageId: 's-1' }) {
  const state = { rows };
  const repo = {
    get rows() {
      return state.rows;
    },
    set rows(next: StoredGrant[]) {
      state.rows = next;
    },
    grantsOf: jest.fn((_id: string) => Promise.resolve(state.rows)),
    linkOf: jest.fn((_id: string) => Promise.resolve(link)),
  };
  const ctx = fakeCls();
  const service = new PermissionsService(repo as unknown as GrantsRepository, ctx.cls);
  return { service, repo, ...ctx };
}

const USER = { id: 'u-1' };

describe('resolveGrants (pure)', () => {
  it('permission union — two roles give every key of both, in registry order', () => {
    const { scopes } = resolveGrants([
      g('accountant', 'hr.payroll.view'),
      g('accountant', 'hr.employees.view_salary'),
      g('stage_head', 'hr.penalties.record', 'own_stage'),
      g('stage_head', 'hr.employees.view', 'own_stage'),
    ]);
    const keys = [...scopes.keys()];
    expect(keys.sort()).toEqual(
      [
        'hr.employees.view',
        'hr.employees.view_salary',
        'hr.payroll.view',
        'hr.penalties.record',
      ].sort(),
    );
    expect([...scopes.keys()]).toEqual(PERMISSION_KEYS.filter((k) => scopes.has(k)));
  });

  it('scope widening — the widest scope of a key wins, whatever order the rows come in', () => {
    const rows = [
      g('direct_manager', 'hr.employees.view', 'own_team'),
      g('stage_head', 'hr.employees.view', 'own_stage'),
      g('self_service', 'hr.employees.view', 'self'),
    ];
    expect(resolveGrants(rows).scopes.get('hr.employees.view')).toBe('own_stage');
    expect(resolveGrants([...rows].reverse()).scopes.get('hr.employees.view')).toBe('own_stage');
    expect(
      resolveGrants([...rows, g('hr_manager', 'hr.employees.view')]).scopes.get(
        'hr.employees.view',
      ),
    ).toBe('all');
  });

  it('the System admin holds every key with scope all, even keys missing from its rows', () => {
    const { scopes } = resolveGrants([
      g('system_admin', 'core.audit.view'),
      g('direct_manager', 'hr.employees.view', 'own_team'),
    ]);
    expect([...scopes.keys()]).toEqual(PERMISSION_KEYS);
    expect(new Set(scopes.values())).toEqual(new Set(['all']));
  });

  it('a role without permissions, or no roles, holds nothing', () => {
    expect(resolveGrants([g('empty', null, null)]).scopes.size).toBe(0);
    expect(resolveGrants([]).scopes.size).toBe(0);
  });

  it('unknown keys and scopes are left out and listed', () => {
    const { scopes, unknown } = resolveGrants([
      g('hr_officer', 'hr.payroll.delete'),
      g('hr_officer', 'hr.payroll.view', 'galaxy'),
      g('hr_officer', 'hr.lateness.view'),
    ]);
    expect([...scopes.keys()]).toEqual(['hr.lateness.view']);
    expect(unknown).toEqual([
      'hr_officer:hr.payroll.delete:all',
      'hr_officer:hr.payroll.view:galaxy',
    ]);
  });
});

describe('PermissionsService', () => {
  it('edge case 2 — a user with two roles holds the union; the widest scope wins per key', async () => {
    const { service } = makeService([
      g('direct_manager', 'hr.employees.view', 'own_team'),
      g('direct_manager', 'hr.penalties.record', 'own_team'),
      g('principal', 'hr.employees.view', 'all'),
      g('principal', 'hr.penalties.approve', 'all'),
    ]);
    expect(await service.permissionsFor(USER)).toEqual([
      'hr.employees.view',
      'hr.penalties.record',
      'hr.penalties.approve',
    ]);
    expect(await service.scopeFor(USER, 'hr.employees.view')).toMatchObject({ scope: 'all' });
    expect(await service.scopeFor(USER, 'hr.penalties.record')).toMatchObject({
      scope: 'own_team',
    });
  });

  it('reads the database once per request, whatever the number of checks', async () => {
    const { service, repo } = makeService([g('hr_manager', 'hr.payroll.view')]);
    await Promise.all([service.permissionsFor(USER), service.permissionsFor(USER)]);
    await service.scopeFor(USER, 'hr.payroll.view');
    await service.scopeFor(USER, 'hr.payroll.view');
    expect(repo.grantsOf).toHaveBeenCalledTimes(1);
    expect(repo.linkOf).toHaveBeenCalledTimes(1);
  });

  it('edge case 7 — a role’s permissions changed → the next request gets the new set, no re-login', async () => {
    const { service, repo, newRequest } = makeService([g('hr_officer', 'hr.payroll.view')]);
    expect(await service.permissionsFor(USER)).toEqual(['hr.payroll.view']);

    repo.rows = [g('hr_officer', 'hr.payroll.view'), g('hr_officer', 'hr.payroll.approve')];
    // Same request: still the set it started with.
    expect(await service.permissionsFor(USER)).toEqual(['hr.payroll.view']);
    newRequest();
    expect(await service.permissionsFor(USER)).toEqual(['hr.payroll.view', 'hr.payroll.approve']);
  });

  it('edge case 8 — an unknown key stored in the DB is ignored and reported in the logs', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = makeService([
      g('hr_officer', 'hr.payroll.view'),
      g('hr_officer', 'hr.removed_area.do_it'),
    ]);
    expect(await service.permissionsFor(USER)).toEqual(['hr.payroll.view']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('hr.removed_area.do_it');
    warn.mockRestore();
  });

  it('caches per user: two users in one request each get their own set', async () => {
    const { service, repo } = makeService([]);
    repo.grantsOf.mockImplementation((id: string) =>
      Promise.resolve(id === 'u-1' ? [g('accountant', 'hr.payroll.view')] : []),
    );
    expect(await service.permissionsFor({ id: 'u-1' })).toEqual(['hr.payroll.view']);
    expect(await service.permissionsFor({ id: 'u-2' })).toEqual([]);
  });

  it('a failed read is not cached', async () => {
    const { service, repo } = makeService([g('accountant', 'hr.payroll.view')]);
    repo.grantsOf.mockRejectedValueOnce(new Error('db down'));
    await expect(service.permissionsFor(USER)).rejects.toThrow('db down');
    await expect(service.permissionsFor(USER)).resolves.toEqual(['hr.payroll.view']);
  });

  it('outside a request (seed, scripts) nothing is cached', async () => {
    const { service, repo, outsideRequest } = makeService([g('accountant', 'hr.payroll.view')]);
    outsideRequest();
    await service.permissionsFor(USER);
    await service.permissionsFor(USER);
    expect(repo.grantsOf).toHaveBeenCalledTimes(2);
  });
});

describe('scopeFor (R5)', () => {
  it('returns the scope with the user’s linked employee and stage', async () => {
    const { service } = makeService([g('stage_head', 'hr.employees.view', 'own_stage')], {
      employeeId: 'e-7',
      stageId: 's-2',
    });
    expect(await service.scopeFor(USER, 'hr.employees.view')).toEqual({
      scope: 'own_stage',
      employeeId: 'e-7',
      stageId: 's-2',
    });
  });

  it('a key the user does not hold → null (the module returns nothing / 403)', async () => {
    const { service, repo } = makeService([g('stage_head', 'hr.employees.view', 'own_stage')]);
    expect(await service.scopeFor(USER, 'hr.payroll.view')).toBeNull();
    expect(repo.linkOf).not.toHaveBeenCalled();
  });

  it('no linked employee → ids are null, so a scoped query matches no rows', async () => {
    const { service } = makeService([g('direct_manager', 'hr.employees.view', 'own_team')], {
      employeeId: null,
      stageId: null,
    });
    expect(await service.scopeFor(USER, 'hr.employees.view')).toEqual({
      scope: 'own_team',
      employeeId: null,
      stageId: null,
    });
  });

  it('the System admin’s scope is all for every key', async () => {
    const { service } = makeService([g('system_admin', 'core.audit.view')]);
    for (const key of PERMISSION_KEYS) {
      expect((await service.scopeFor(USER, key))?.scope).toBe('all');
    }
  });
});
