import { hashPassword } from '../../common/utils/password.util';
import type { UserCredentials, UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';

async function makeService(found: Partial<UserCredentials> | null) {
  const record: UserCredentials | null = found
    ? {
        id: 'u-1',
        email: 'admin@school.local',
        name: 'HR Admin',
        role: 'HR_ADMIN',
        isActive: true,
        passwordHash: await hashPassword('right-password', 4),
        ...found,
      }
    : null;
  const repo = {
    findCredentialsByEmail: jest.fn().mockResolvedValue(record),
    findActiveAuthUser: jest.fn(),
  };
  return { service: new UsersService(repo as unknown as UsersRepository), repo };
}

describe('UsersService.verifyCredentials', () => {
  it('returns the safe user for the right password, never the hash', async () => {
    const { service } = await makeService({});
    const user = await service.verifyCredentials('admin@school.local', 'right-password');
    expect(user).toEqual({
      id: 'u-1',
      email: 'admin@school.local',
      name: 'HR Admin',
      role: 'HR_ADMIN',
    });
  });

  it('looks the email up normalised (trimmed, lower-case)', async () => {
    const { service, repo } = await makeService({});
    await service.verifyCredentials('  Admin@School.LOCAL ', 'right-password');
    expect(repo.findCredentialsByEmail).toHaveBeenCalledWith('admin@school.local');
  });

  it.each([
    ['a wrong password', {}, 'wrong'],
    ['an unknown email', null, 'right-password'],
    ['an inactive user', { isActive: false }, 'right-password'],
  ])('returns null for %s', async (_label, found, password) => {
    const { service } = await makeService(found);
    await expect(service.verifyCredentials('admin@school.local', password)).resolves.toBeNull();
  });
});
