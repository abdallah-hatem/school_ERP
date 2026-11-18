// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/roles',
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({ CREATE_ROLE: vi.fn(), UPDATE_ROLE: vi.fn(), DELETE_ROLE: vi.fn() }));

import { PERMISSION_KEYS } from '@school-erp/shared';
import { sessionWithout } from '@/test/render';
import { CREATE_ROLE, UPDATE_ROLE } from '../apis';
import { account, customRole, ok, renderAccess, role } from '../test/fixtures';
import { RoleForm } from './role-form';

const update = vi.mocked(UPDATE_ROLE);
const create = vi.mocked(CREATE_ROLE);
type Res<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;

const row = (key: string) => document.querySelector(`[data-permission="${key}"]`) as HTMLElement;

describe('RoleForm', () => {
  beforeEach(() => {
    push.mockReset();
    update.mockReset();
    create.mockReset();
  });
  afterEach(cleanup);

  it('a switch turns a permission on; the scope of a row-level one is chosen inline; Save waits for a change', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    update.mockResolvedValue(ok(customRole) as Res<typeof UPDATE_ROLE>);
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />);
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    // Off: its scope can't be chosen.
    const penalties = row('hr.penalties.view');
    expect(within(penalties).getByRole('radio', { name: 'Their team' }).hasAttribute('disabled')).toBe(true);
    await user.click(within(penalties).getByRole('switch'));
    await user.click(within(penalties).getByRole('radio', { name: 'Their team' }));
    expect(penalties.hasAttribute('data-changed')).toBe(true);
    expect(screen.getByText('1 unsaved change')).toBeTruthy();

    // A whole-school permission has no scope control.
    expect(within(row('hr.payroll.approve')).queryByRole('radio')).toBeNull();
    expect(within(row('hr.payroll.approve')).getByText('Whole school')).toBeTruthy();

    await user.click(save);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(customRole.id, {
        nameEn: 'Front desk',
        nameAr: 'مكتب الاستقبال',
        permissions: [
          { key: 'hr.employees.view', scope: 'all' },
          { key: 'hr.penalties.view', scope: 'own_team' },
        ],
      }),
    );
  });

  it('switching a permission back off leaves no change; "Turn all on" turns the module on', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />);
    const sw = within(row('hr.lateness.view')).getByRole('switch');
    await user.click(sw);
    await user.click(sw);
    expect(screen.getByText('No changes yet')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Turn all on' })[0]!);
    expect(within(row('core.settings.view')).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    // Every core key was off on this role: one change each.
    const coreKeys = PERMISSION_KEYS.filter((k) => k.startsWith('core.')).length;
    expect(screen.getByText(`${coreKeys} unsaved changes`)).toBeTruthy();
  });

  it('a stage head’s scoped permission shows its scope', () => {
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={role('stage_head')} />);
    expect(within(row('hr.employees.view')).getByRole('radio', { checked: true }).textContent).toBe('Their stage');
  });

  it('System admin is read-only: every permission locked on, no switches, no Save', () => {
    renderAccess(
      <RoleForm basePath="/en/roles" usersPath="/en/users" role={role('system_admin')} holders={[account()]} holdersTotal={1} />,
    );
    expect(screen.getByText('Holds every permission')).toBeTruthy();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Turn all on' })).toBeNull();
    expect(document.querySelectorAll('[data-permission]')).toHaveLength(PERMISSION_KEYS.length);
    expect(screen.getByRole('link', { name: 'Hany Saad' }).getAttribute('href')).toBe(`/en/users/${account().id}`);
  });

  it('adding a role needs both names; Duplicate starts from the other role’s permissions', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    create.mockResolvedValue(ok(customRole) as Res<typeof CREATE_ROLE>);
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" />);
    await user.click(screen.getByRole('button', { name: 'Add role' }));
    expect(screen.getByText("Enter the role's English name.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    cleanup();

    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" copyFrom={role('accountant')} />);
    expect((screen.getByRole('textbox', { name: /Name in English/ }) as HTMLInputElement).value).toBe('Copy of Accountant');
    await user.click(screen.getByRole('button', { name: 'Add role' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].permissions.map((p) => p.key)).toEqual(role('accountant').permissions.map((p) => p.key));
  });

  it('without core.roles.manage the page is read-only', () => {
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />, 'en', sessionWithout('core.roles.manage'));
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
