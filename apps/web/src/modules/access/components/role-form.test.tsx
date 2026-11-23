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
import { sessionWith, sessionWithout } from '@/test/render';
import { CREATE_ROLE, UPDATE_ROLE } from '../apis';
import { account, customRole, fail, ok, renderAccess, role } from '../test/fixtures';
import { RoleForm } from './role-form';

const update = vi.mocked(UPDATE_ROLE);
const create = vi.mocked(CREATE_ROLE);
type Res<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;

const row = (key: string) => document.querySelector(`[data-permission="${key}"]`) as HTMLElement;
/** A module's fold button (its header: name and "n of total"). */
const moduleButton = (name: 'School' | 'HR' | 'Accounting') => screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });
const openModules = async (user: ReturnType<typeof userEvent.setup>, ...names: ('School' | 'HR' | 'Accounting')[]) => {
  for (const name of names) await user.click(moduleButton(name));
};

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
    await openModules(user, 'HR');

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
    await openModules(user, 'HR');
    const sw = within(row('hr.lateness.view')).getByRole('switch');
    await user.click(sw);
    await user.click(sw);
    expect(screen.getByText('No changes yet')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Turn all on' })[0]!);
    await openModules(user, 'School');
    expect(within(row('core.settings.view')).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    // Every core key was off on this role: one change each.
    const coreKeys = PERMISSION_KEYS.filter((k) => k.startsWith('core.')).length;
    expect(screen.getByText(`${coreKeys} unsaved changes`)).toBeTruthy();
  });

  it('a stage head’s scoped permission shows its scope', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={role('stage_head')} />);
    await openModules(user, 'HR');
    expect(within(row('hr.employees.view')).getByRole('radio', { checked: true }).textContent).toBe('Their stage');
  });

  it('System admin is read-only: every permission locked on, no switches, no Save', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(
      <RoleForm basePath="/en/roles" usersPath="/en/users" role={role('system_admin')} holders={[account()]} holdersTotal={1} />,
    );
    // Its modules start closed too.
    expect(document.querySelectorAll('[data-permission]')).toHaveLength(0);
    await openModules(user, 'School', 'HR', 'Accounting');
    expect(screen.getByText('Holds every permission')).toBeTruthy();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Turn all on' })).toBeNull();
    expect(document.querySelectorAll('[data-permission]')).toHaveLength(PERMISSION_KEYS.length);
    expect(screen.getByRole('link', { name: 'Hany Saad' }).getAttribute('href')).toBe(`/en/users/${account().id}`);
  });

  it('a module starts closed; opening it shows its switches; "Turn all on" works while closed without opening it', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />);
    const hrKeys = PERMISSION_KEYS.filter((k) => k.startsWith('hr.')).length;
    const hr = moduleButton('HR');
    expect(hr.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(hr.textContent).toContain(`1 of ${hrKeys}`);

    // "Turn all on" sits outside the fold button: the count changes, the module stays closed.
    const section = hr.closest('section') as HTMLElement;
    await user.click(within(section).getByRole('button', { name: 'Turn all on' }));
    expect(hr.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(hr.textContent).toContain(`${hrKeys} of ${hrKeys}`);
    expect(within(section).getByRole('button', { name: 'Turn all off' })).toBeTruthy();
    expect(screen.getByText(`${hrKeys - 1} unsaved changes`)).toBeTruthy();

    // Opening it (from the keyboard too: it is a button) shows its switches, all on.
    hr.focus();
    await user.keyboard('{Enter}');
    expect(hr.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(hr.getAttribute('aria-controls') ?? '') as HTMLElement;
    const switches = within(panel).getAllByRole('switch');
    expect(switches).toHaveLength(hrKeys);
    expect(switches.every((s) => s.getAttribute('aria-checked') === 'true')).toBe(true);
    await user.click(hr);
    expect(hr.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
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

  it('without core.roles.manage the page is read-only', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />, 'en', sessionWithout('core.roles.manage'));
    await openModules(user, 'School', 'HR', 'Accounting');
    expect(document.querySelectorAll('[data-permission]')).toHaveLength(PERMISSION_KEYS.length);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  describe('H2 — the access ceiling, as the screen shows it (security review, owner 2026-11-23)', () => {
    const manager = sessionWith('core.roles.view', 'core.roles.manage', 'hr.employees.view');

    it('a permission the user doesn’t hold can’t be turned on, and turning a module on skips it', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />, 'en', manager);
      await openModules(user, 'HR');
      expect((within(row('hr.payroll.approve')).getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
      expect(within(row('hr.payroll.approve')).getByText("You don't hold this permission, so you can't give it.")).toBeTruthy();
      expect(screen.getByTestId('role-ceiling-note')).toBeTruthy();
      // Held (and on): it can still be turned off.
      expect((within(row('hr.employees.view')).getByRole('switch') as HTMLButtonElement).disabled).toBe(false);
      const hr = screen.getByRole('region', { name: /^HR/ });
      await user.click(within(hr).getByRole('button', { name: 'Turn all on' }));
      expect(row('hr.payroll.approve').querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    });

    it('fifth review — a refused save (ROLE_HAS_UNLINKED_HOLDER) shows the reason and brings it into view', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const scrolled = vi.fn();
      HTMLElement.prototype.scrollIntoView = scrolled;
      update.mockResolvedValue(fail('ROLE_HAS_UNLINKED_HOLDER', 'x') as unknown as Res<typeof UPDATE_ROLE>);
      renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />);
      await openModules(user, 'HR');
      await user.click(within(row('hr.penalties.view')).getByRole('switch'));
      await user.click(screen.getByRole('button', { name: 'Save' }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Someone holding this role has no employee record');
      await waitFor(() => expect(scrolled).toHaveBeenCalled());
    });

    it('a role the user holds is view-only for them, saying why', () => {
      const holder = { ...manager, roles: [{ id: customRole.id, key: customRole.key, nameEn: customRole.nameEn, nameAr: customRole.nameAr }] };
      renderAccess(<RoleForm basePath="/en/roles" usersPath="/en/users" role={customRole} />, 'en', holder);
      expect(screen.getByTestId('role-held-note').textContent).toBe("You hold this role, so you can't change it. Another administrator can.");
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });
  });
});
