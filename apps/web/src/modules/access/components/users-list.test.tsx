// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/users',
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({
  DEACTIVATE_USER: vi.fn(),
  REACTIVATE_USER: vi.fn(),
  SET_TEMPORARY_PASSWORD: vi.fn(),
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
      roles={ROLES}
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

    // Eight roles: the role filter is searchable; focus lands in its search box.
    await user.click(screen.getByRole('combobox', { name: 'Role' }));
    await user.keyboard('officer');
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
    expect(screen.getAllByText('Must change password').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Never').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Today, 09:12').length).toBeGreaterThan(0);
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
      <UsersList basePath="/en/users" query={parseUsersQuery({ search: 'samy' })} rows={[]} total={0} roles={ROLES} lastAdminId={null} now={NOW} />,
    );
    expect(screen.getByText('No users match these filters')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(push).toHaveBeenLastCalledWith('/en/users', { scroll: false });
  });

  it('Arabic: the same list, mirrored', () => {
    renderAccess(
      <UsersList basePath="/ar/users" query={parseUsersQuery({})} rows={[admin]} total={1} roles={ROLES} lastAdminId={admin.id} now={NOW} />,
      'ar',
    );
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'المستخدمون' })).toBeTruthy();
    expect(screen.getAllByText('مدير النظام').length).toBeGreaterThan(0);
  });
});
