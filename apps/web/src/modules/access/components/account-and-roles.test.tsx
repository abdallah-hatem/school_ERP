// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/account',
  redirect: vi.fn(),
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({ DELETE_ROLE: vi.fn() }));
vi.mock('@/core/auth/apis', () => ({ CHANGE_OWN_PASSWORD: vi.fn(), GET_ME: vi.fn(), LOGIN: vi.fn(), LOGOUT: vi.fn() }));
vi.mock('@/core/auth/actions', () => ({ signOut: vi.fn(), signIn: vi.fn() }));

import { CHANGE_OWN_PASSWORD } from '@/core/auth/apis';
import { DELETE_ROLE } from '../apis';
import { chooseRowAction, menuItemNames, openRowActions } from '@/test/row-actions';
import { sessionWithout } from '@/test/render';
import { account, customRole, NOW, renderAccess, ROLES } from '../test/fixtures';
import { AccountView } from './account-view';
import { RolesList } from './roles-list';

const change = vi.mocked(CHANGE_OWN_PASSWORD);
type Res = Awaited<ReturnType<typeof CHANGE_OWN_PASSWORD>>;

describe('My account', () => {
  beforeEach(() => change.mockReset());
  afterEach(cleanup);

  it('Change password waits for all three fields; a wrong current one shows under it', async () => {
    const user = userEvent.setup();
    change.mockResolvedValue({ success: false, status: 400, error: 'WRONG_PASSWORD', message: 'x' } as Res);
    renderAccess(<AccountView account={account()} now={NOW} />);
    const button = screen.getByRole('button', { name: 'Change password' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Fill in all three fields.')).toBeTruthy();
    await user.type(screen.getByLabelText(/^Current password/), 'not-it');
    await user.type(screen.getByLabelText(/^New password/), 'my-new-password-1');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'my-new-password-1');
    expect(button.disabled).toBe(false);
    await user.click(button);
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith({ currentPassword: 'not-it', newPassword: 'my-new-password-1' }),
    );
    expect(await screen.findByText('The current password is not right.')).toBeTruthy();
  });

  it('shows the roles and the linked employee; name and email are read-only', () => {
    renderAccess(<AccountView account={account()} now={NOW} />);
    expect(screen.getAllByText('System admin').length).toBeGreaterThan(0);
    expect(screen.getByText('EMP-0002')).toBeTruthy();
    expect((screen.getByLabelText('Full name') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText('Today, 09:12')).toBeTruthy();
  });
});

describe('Roles list', () => {
  afterEach(cleanup);
  const roles = [...ROLES, customRole];

  it('every role but System admin has Delete (owner 2026-11-19); System admin only opens', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<RolesList basePath="/en/roles" roles={roles} holderNames={{ [ROLES[0]!.id]: ['Hany Saad'] }} />);
    expect(screen.getAllByText('Every permission').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Starting role').length).toBeGreaterThan(0);
    expect(menuItemNames(await openRowActions(user, 'System admin'))).toEqual(['Open']);
    await user.keyboard('{Escape}');
    expect(menuItemNames(await openRowActions(user, 'Stage head'))).toEqual(['Edit', 'Duplicate', 'Delete']);
    await user.keyboard('{Escape}');
    expect(menuItemNames(await openRowActions(user, 'Front desk'))).toEqual(['Edit', 'Duplicate', 'Delete']);
  });

  it('deleting an unused starting role warns it won’t get future permissions; a custom role doesn’t', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<RolesList basePath="/en/roles" roles={roles} holderNames={{}} />);
    await chooseRowAction(user, 'Stage head', 'Delete');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/future updates add new permissions to starting roles/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Delete role' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await chooseRowAction(user, 'Front desk', 'Delete');
    const custom = await screen.findByRole('dialog');
    expect(within(custom).queryByText(/future updates/)).toBeNull();
  });

  it('a held role’s Delete says who still holds it, with no way to delete', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const held = [...ROLES.map((r) => (r.key === 'hr_manager' ? { ...r, userCount: 3 } : r)), customRole];
    renderAccess(<RolesList basePath="/en/roles" roles={held} holderNames={{}} />);
    await chooseRowAction(user, 'HR manager', 'Delete');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("“HR manager” can't be deleted yet")).toBeTruthy();
    expect(within(dialog).getByText(/3 users still hold it/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Delete role' })).toBeNull();
    expect(DELETE_ROLE).not.toHaveBeenCalled();
  });

  it('without core.roles.manage: no Add custom role, the ⋯ only opens', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<RolesList basePath="/en/roles" roles={roles} holderNames={{}} />, 'en', sessionWithout('core.roles.manage'));
    expect(screen.queryByRole('link', { name: 'Add custom role' })).toBeNull();
    expect(menuItemNames(await openRowActions(user, 'Front desk'))).toEqual(['Open']);
  });
});
