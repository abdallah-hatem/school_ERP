import type { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@school-erp/shared';
import type { PermissionsService } from '../../permissions';
import { FileFolders, PUBLIC_FILE_FOLDERS, type FileFolderAccess } from './file-folders';
import { FileStorageService } from './file-storage.service';

/*
 * Files follow their record (docs/ARCHITECTURE.md → Security): a folder's owner decides who opens
 * its files; an unknown folder, a missing permission or a record out of view is 404 alike.
 */

const USER: AuthUser = { id: 'u1', email: 'a@school.test', name: 'A', mustChangePassword: false };

function make(held: string[] = []) {
  const permissions = {
    scopeFor: jest.fn((_user: unknown, key: string) => Promise.resolve(held.includes(key) ? { scope: 'all' } : null)),
  };
  return new FileFolders(permissions as unknown as PermissionsService);
}

const status = (p: Promise<unknown>) => p.then(() => 'opened', (e: { status?: number }) => e.status);

describe('FileFolders', () => {
  it('an unknown folder → 404; a public one (own routes) → 404 here too', async () => {
    const folders = make();
    expect(await status(folders.assertCanOpen(USER, 'payslips', 'a.pdf'))).toBe(404);
    for (const folder of PUBLIC_FILE_FOLDERS) {
      expect(await status(folders.assertCanOpen(USER, folder, 'x.png'))).toBe(404);
    }
  });

  it('the owner check decides, with the file’s URL; out of view → 404 (never 403)', async () => {
    const folders = make();
    const canOpen = jest.fn((_user: AuthUser, url: string) => Promise.resolve(url.endsWith('/mine.png')));
    folders.register('employee-photos', { owner: 'hr.employee', canOpen });
    expect(await status(folders.assertCanOpen(USER, 'employee-photos', 'mine.png'))).toBe('opened');
    expect(canOpen).toHaveBeenCalledWith(USER, '/files/employee-photos/mine.png');
    expect(await status(folders.assertCanOpen(USER, 'employee-photos', 'theirs.png'))).toBe(404);
  });

  it('a sensitive folder: its extra permission first (404 without it), then the owner, then onOpen', async () => {
    const onOpen = jest.fn(() => Promise.resolve());
    const access: FileFolderAccess = {
      owner: 'hr.contract',
      permission: 'hr.employees.view_salary',
      canOpen: jest.fn(() => Promise.resolve(true)),
      onOpen,
    };
    const without = make();
    without.register('contracts', access);
    expect(await status(without.assertCanOpen(USER, 'contracts', 'c.pdf'))).toBe(404);
    expect(access.canOpen).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();

    const holder = make(['hr.employees.view_salary']);
    holder.register('contracts', access);
    expect(await status(holder.assertCanOpen(USER, 'contracts', 'c.pdf'))).toBe('opened');
    expect(onOpen).toHaveBeenCalledWith(USER, '/files/contracts/c.pdf');
  });

  it('opening that cannot be recorded does not happen', async () => {
    const folders = make();
    folders.register('investigations', {
      owner: 'hr.investigation',
      canOpen: () => Promise.resolve(true),
      onOpen: () => Promise.reject(new Error('audit down')),
    });
    await expect(folders.assertCanOpen(USER, 'investigations', 'i.pdf')).rejects.toThrow('audit down');
  });

  it('one owner per folder: registering twice, or a public folder, throws', () => {
    const folders = make();
    const access = { owner: 'x', canOpen: () => Promise.resolve(true) };
    folders.register('employee-photos', access);
    expect(() => folders.register('employee-photos', access)).toThrow(/already registered/);
    expect(() => folders.register(PUBLIC_FILE_FOLDERS[0] ?? 'logo', access)).toThrow(/already registered/);
    expect(folders.registered()).toEqual(['employee-photos']);
  });
});

describe('FileStorageService.save', () => {
  it('refuses a folder with no registered owner (nothing stored that nobody could open)', async () => {
    const config = { getOrThrow: () => '/nonexistent-uploads-root' } as unknown as ConfigService;
    const storage = new FileStorageService(config, make());
    await expect(storage.save('payslips', 'a.pdf', Buffer.from('x'))).rejects.toThrow(/no registered owner/);
  });
});
