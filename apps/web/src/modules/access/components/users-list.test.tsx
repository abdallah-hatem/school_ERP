// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/users',
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const UNLOCK_SIGN_IN = vi.hoisted(() => vi.fn());
// The role filter's choices come from the API (searched there, never here).
const GET_ROLES = vi.hoisted(() => vi.fn());
vi.mock('../apis', () => ({
  GET_ROLES,
  DEACTIVATE_USER: vi.fn(),
  REACTIVATE_USER: vi.fn(),
  SET_TEMPORARY_PASSWORD: vi.fn(),
  UNLOCK_SIGN_IN,
}));

import { chooseRowAction, menuItemNames, openRowActions } from '@/test/row-actions';
import { sessionWithout } from '@/test/render';
import { parseUsersQuery } from '../lib/users-query';
import { account, NOW, renderAccess, role, ROLES } from '../test/fixtures';
import { UsersList } from './users-list';

const admin = account();
const officer = account({
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Rania Magdy',
  email: 'rania@school.test',
  roles: [{ ...role('hr_officer') }],
  employee: null,
  mustChangePassword: true,
  lastSignInAt: null,
});
const gone = account({ id: '00000000-0000-4000-8000-000000000003', name: 'Youssef Kamal', isActive: false, roles: [] });

function renderList(params: Record<string, string> = {}, opts: { total?: number; session?: ReturnType<typeof sessionWithout> } = {}) {
  return renderAccess(
    <UsersList
      basePath="/en/users"
      query={parseUsersQuery(params)}
      rows={[admin, officer, gone]}
      total={opts.total ?? 3}
      lastAdminId={admin.id}
      now={NOW}
    />,
    'en',
    opts.session,
  );
}

describe('UsersList', () => {
  beforeEach(() => push.mockReset());
  afterEach(cleanup);

  it('the role and status filters go to the URL from page 1, without scrolling', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList({ page: '3' }, { total: 40 });
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Inactive' }));
    expect(push).toHaveBeenLastCalledWith('/en/users?status=inactive', { scroll: false });

    // The role filter asks the API for what is typed; focus lands in its search box.
    GET_ROLES.mockImplementation(({ search }: { search?: string }) =>
      Promise.resolve({ success: true, status: 200, data: ROLES.filter((r) => !search || r.nameEn.toLowerCase().includes(search.toLowerCase())) }),
    );
    await user.click(screen.getByRole('combobox', { name: 'Role' }));
    await user.keyboard('officer');
    await waitFor(() => expect(GET_ROLES).toHaveBeenLastCalledWith({ search: 'officer', limit: 20 }));
    await user.click(await screen.findByRole('option', { name: 'HR officer' }));
    expect(push).toHaveBeenLastCalledWith(`/en/users?roleId=${role('hr_officer').id}`, { scroll: false });
  });

  it('search is debounced and sent to the server; paging keeps the filters', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList({ status: 'active' }, { total: 25 });
    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), 'rania');
    await vi.waitFor(() => expect(push).toHaveBeenLastCalledWith('/en/users?search=rania&status=active', { scroll: false }));
    expect(screen.getByText('Showing 1–10 of 25')).toBeTruthy();
    // The search's navigation dims the list and disables paging until it settles; wait for that
    // (slow CI machines take longer) before paging.
    const page2 = screen.getByRole('button', { name: 'Page 2' });
    await vi.waitFor(() => expect(page2).toHaveProperty('disabled', false));
    await user.click(page2);
    await vi.waitFor(() => expect(push).toHaveBeenLastCalledWith('/en/users?status=active&page=2', { scroll: false }));
  });

  it('the only System admin’s ⋯ has no Deactivate; an inactive user has Reactivate', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList();
    expect(menuItemNames(await openRowActions(user, 'Hany Saad'))).toEqual(['Edit', 'Set temporary password']);
    await user.keyboard('{Escape}');
    expect(menuItemNames(await openRowActions(user, 'Rania Magdy'))).toEqual(['Edit', 'Set temporary password', 'Deactivate']);
    await user.keyboard('{Escape}');
    expect(menuItemNames(await openRowActions(user, 'Youssef Kamal'))).toEqual(['Edit', 'Reactivate']);
  });

  it('Deactivate asks first', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList();
    await chooseRowAction(user, 'Rania Magdy', 'Deactivate');
    expect(await screen.findByRole('dialog', { name: 'Deactivate Rania Magdy?' })).toBeTruthy();
  });

  it('shows who must change their password and who never signed in', () => {
    renderList();
    // A short one-line pill in the status column; the full wording is its tooltip.
    expect(screen.getAllByText('Temporary password').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Must change password').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Never').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Today, 09:12').length).toBeGreaterThan(0);
  });

  it('each user has an avatar, never initials: the linked employee’s photo or silhouette, else the neutral one; inactive greyed', () => {
    const withPhoto = account({ employee: { ...admin.employee!, photoUrl: '/files/employee-photos/hany.jpg' } });
    renderAccess(
      <UsersList basePath="/en/users" query={parseUsersQuery({})} rows={[withPhoto, officer, gone]} total={3} lastAdminId={admin.id} now={NOW} />,
    );
    const avatarIn = (name: string) => screen.getAllByRole('link', { name })[0]!.closest('span.flex')!.parentElement!.querySelector('[data-avatar]') as HTMLElement;
    expect(avatarIn('Hany Saad').dataset.avatar).toBe('photo');
    expect(avatarIn('Rania Magdy').querySelector('[data-silhouette]')?.getAttribute('data-silhouette')).toBe('neutral');
    expect(avatarIn('Youssef Kamal').querySelector('[data-silhouette]')?.getAttribute('data-silhouette')).toBe('male');
    expect(avatarIn('Youssef Kamal').className).toContain('opacity-70');
    for (const name of ['Hany Saad', 'Rania Magdy', 'Youssef Kamal']) expect(avatarIn(name).textContent).toBe('');
  });

  it('without core.users.manage: no Add user, and the ⋯ only opens the user', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderList({}, { session: sessionWithout('core.users.manage') });
    expect(screen.queryByRole('link', { name: 'Add user' })).toBeNull();
    expect(menuItemNames(await openRowActions(user, 'Rania Magdy'))).toEqual(['Open']);
  });

  it('filters that match nobody → "no results" with Clear filters', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(
      <UsersList basePath="/en/users" query={parseUsersQuery({ search: 'samy' })} rows={[]} total={0} lastAdminId={null} now={NOW} />,
    );
    expect(screen.getByText('No users match these filters')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: /Clear filters/ })[0]!);
    expect(push).toHaveBeenLastCalledWith('/en/users', { scroll: false });
  });

  it('Arabic: the same list, mirrored', () => {
    renderAccess(
      <UsersList basePath="/ar/users" query={parseUsersQuery({})} rows={[admin]} total={1} lastAdminId={admin.id} now={NOW} />,
      'ar',
    );
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'المستخدمون' })).toBeTruthy();
    expect(screen.getAllByText('مدير النظام').length).toBeGreaterThan(0);
  });

  describe('a sign-in locked by too many wrong passwords (owner 2026-11-18)', () => {
    // Locked until 12:15 UTC = 14:15 school time (Cairo).
    const locked = account({
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Salma Adel',
      email: 'salma@school.test',
      roles: [{ ...role('hr_officer') }],
      employee: null,
      lockedUntil: '2026-11-17T12:15:00.000Z',
    });
    const renderLocked = (session?: ReturnType<typeof sessionWithout>) =>
      renderAccess(
        <UsersList basePath="/en/users" query={parseUsersQuery({})} rows={[admin, locked]} total={2} lastAdminId={admin.id} now={NOW} />,
        'en',
        session,
      );

    it('shows a Locked pill with when it ends, and only that row has Unlock sign-in', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      renderLocked();
      expect(screen.getAllByText('Sign-in locked').length).toBeGreaterThan(0);
      expect(
        screen.getAllByTitle('Too many wrong passwords: sign-in is locked until 14:15.').length,
      ).toBeGreaterThan(0);
      expect(menuItemNames(await openRowActions(user, 'Salma Adel'))).toEqual([
        'Edit',
        'Set temporary password',
        'Unlock sign-in',
        'Deactivate',
      ]);
      await user.keyboard('{Escape}');
      expect(menuItemNames(await openRowActions(user, 'Hany Saad'))).not.toContain('Unlock sign-in');
    });

    it('Unlock sign-in asks first, then unlocks that user', async () => {
      UNLOCK_SIGN_IN.mockResolvedValue({ success: true, status: 200, data: { ...locked, lockedUntil: null } });
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      renderLocked();
      await chooseRowAction(user, 'Salma Adel', 'Unlock sign-in');
      const dialog = await screen.findByRole('dialog', { name: 'Unlock sign-in for Salma Adel?' });
      expect(UNLOCK_SIGN_IN).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Unlock' }));
      await vi.waitFor(() => expect(UNLOCK_SIGN_IN).toHaveBeenCalledWith(locked.id));
    });

    it('without core.users.manage: the lock shows, but there is no Unlock', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      renderLocked(sessionWithout('core.users.manage'));
      expect(screen.getAllByText('Sign-in locked').length).toBeGreaterThan(0);
      expect(menuItemNames(await openRowActions(user, 'Salma Adel'))).toEqual(['Open']);
    });

    it('Arabic: the pill reads in Arabic', () => {
      renderAccess(
        <UsersList basePath="/ar/users" query={parseUsersQuery({})} rows={[locked]} total={1} lastAdminId={null} now={NOW} />,
        'ar',
      );
      expect(screen.getAllByText('الدخول مقفل').length).toBeGreaterThan(0);
    });
  });
});
