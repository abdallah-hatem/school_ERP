import { PERMISSION_KEYS, type AuthUser } from '@school-erp/shared';
import { permissionsFor } from './permissions-for';

describe('permissionsFor (P1: the HR admin holds every key)', () => {
  it('the HR admin holds every permission key — nothing changes for users', () => {
    expect([...permissionsFor({ role: 'HR_ADMIN' })].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('any other role holds none (closed by default until P2 brings roles as data)', () => {
    expect(permissionsFor({ role: 'SOMEONE_ELSE' as AuthUser['role'] })).toEqual([]);
  });
});
