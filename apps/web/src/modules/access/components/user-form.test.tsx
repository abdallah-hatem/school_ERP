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
vi.mock('../apis', () => ({
  CREATE_USER: vi.fn(),
  UPDATE_USER: vi.fn(),
  DEACTIVATE_USER: vi.fn(),
  REACTIVATE_USER: vi.fn(),
  SET_TEMPORARY_PASSWORD: vi.fn(),
  UNLOCK_SIGN_IN: vi.fn(),
  GET_EMPLOYEE_OPTIONS: vi.fn(),
  GET_ROLES: vi.fn(),
}));

import { CREATE_USER, GET_EMPLOYEE_OPTIONS, GET_ROLES, UNLOCK_SIGN_IN, UPDATE_USER } from '../apis';
import { sessionWith, sessionWithout, TEST_SESSION } from '@/test/render';
import { account, fail, NOW, ok, renderAccess, role, ROLES } from '../test/fixtures';
import { UserForm } from './user-form';

const update = vi.mocked(UPDATE_USER);
const create = vi.mocked(CREATE_USER);
const options = vi.mocked(GET_EMPLOYEE_OPTIONS);
type Res<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;

const officer = account({
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Rania Magdy',
  roles: [{ ...role('hr_officer') }],
  employee: null,
});

function roleBox(name: string) {
  return within(screen.getByRole('group', { name: 'Roles' })).getByRole('checkbox', { name: new RegExp(name) });
}

describe('UserForm', () => {
  beforeEach(() => {
    push.mockReset();
    update.mockReset();
    create.mockReset();
    options.mockReset();
  });
  afterEach(cleanup);

  it('editing: Save is disabled until something changes; back to the original disables it again', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('No changes yet')).toBeTruthy();

    await user.click(roleBox('Accountant'));
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('1 unsaved change')).toBeTruthy();
    await user.click(roleBox('Accountant'));
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends only what changed: the new role set', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    update.mockResolvedValue(ok(officer) as Res<typeof UPDATE_USER>);
    renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />);
    await user.click(roleBox('Accountant'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(officer.id, { roleIds: [role('hr_officer').id, role('accountant').id] }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/users'));
  });

  it('the role checklist asks the API for the typed name and shows its answer; ticks survive the search', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // The API's side (its search is the API's own test): roles whose name holds the text.
    vi.mocked(GET_ROLES).mockImplementation((async (q: { search?: string } = {}) => ({
      success: true,
      status: 200,
      data: ROLES.filter((r) => r.nameEn.toLowerCase().includes((q.search ?? '').toLowerCase())),
    })) as never);
    renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search roles' }), 'manager');
    await waitFor(() => expect(GET_ROLES).toHaveBeenLastCalledWith({ search: 'manager' }));
    const names = () =>
      within(screen.getByRole('group', { name: 'Roles' }))
        .getAllByRole('checkbox')
        .map((c) => c.getAttribute('id') && document.querySelector(`label[for="${c.id}"]`)?.getAttribute('data-role'));
    await waitFor(() => expect(names()).toEqual(['hr_manager', 'direct_manager']));
    await user.clear(screen.getByRole('searchbox', { name: 'Search roles' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search roles' }), 'zzz');
    expect(await screen.findByText('No role matches “zzz”.')).toBeTruthy();
  });

  it('the last System admin: the role is locked with the reason, and Deactivate is disabled', () => {
    const admin = account();
    renderAccess(<UserForm basePath="/en/users" user={admin} roles={ROLES} lastAdmin now={NOW} />);
    const box = roleBox('System admin');
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect((box as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Hany Saad is the only System admin. Give the role to someone else first.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Deactivate account/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("The last System admin can't be deactivated.")).toBeTruthy();
  });

  it('another System admin exists: the role can be taken away', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderAccess(<UserForm basePath="/en/users" user={account()} roles={ROLES} now={NOW} />);
    const box = roleBox('System admin');
    expect((box as HTMLButtonElement).disabled).toBe(false);
    await user.click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('a server rule lands on its field (EMAIL_TAKEN under the email)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    update.mockResolvedValue(fail('EMAIL_TAKEN', 'taken') as Res<typeof UPDATE_USER>);
    renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />);
    const email = screen.getByRole('textbox', { name: /Email/ });
    await user.clear(email);
    await user.type(email, 'mona@school.test');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Another user already has this email.')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('adding: a temporary password is shown and sent; required fields are checked first', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    create.mockResolvedValue(ok(officer) as Res<typeof CREATE_USER>);
    renderAccess(<UserForm basePath="/en/users" roles={ROLES} now={NOW} />);
    const password = screen.getByTestId('temp-password').textContent ?? '';
    expect(password).toMatch(/^[A-Z][a-z]+-\d{4}-[A-Z][a-z]+$/);
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText("Enter the person's full name.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /Full name/ }), 'Rana Mostafa');
    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'rana@school.test');
    await user.click(roleBox('HR officer'));
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'Rana Mostafa',
        email: 'rana@school.test',
        password,
        roleIds: [role('hr_officer').id],
        employeeId: null,
      }),
    );
  });

  it('the employee-record picker asks the API and won’t pick an employee who has an account', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    options.mockResolvedValue(
      ok(
        [
          { id: 'e-1', code: 'EMP-0019', nameEn: 'Rania Magdy', nameAr: 'رانيا', jobTitle: { nameEn: 'HR officer', nameAr: 'م' }, isActive: true, linkedUser: { id: 'u-9', name: 'Rania' } },
          { id: 'e-2', code: 'EMP-0072', nameEn: 'Rana Mostafa', nameAr: 'رنا', jobTitle: { nameEn: 'Science teacher', nameAr: 'م' }, isActive: true, linkedUser: null },
        ],
        { total: 86 },
      ) as Res<typeof GET_EMPLOYEE_OPTIONS>,
    );
    renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />);
    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    expect(await screen.findByText('2 of 86 employees match')).toBeTruthy();
    expect(options).toHaveBeenCalledWith({ search: undefined, limit: 8 });
    await user.click(screen.getByRole('option', { name: /Rania Magdy/ }));
    expect(screen.getByRole('listbox')).toBeTruthy(); // still open: that one can't be picked
    await user.click(screen.getByRole('option', { name: /Rana Mostafa/ }));
    expect(screen.getByRole('combobox', { name: 'Employee' }).textContent).toContain('Rana Mostafa · EMP-0072');
    expect(screen.getByText('1 unsaved change')).toBeTruthy();
  });

  it('roles limited to a stage, team or self without an employee record: a warning by the field, Save still works', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    update.mockResolvedValue(ok(officer) as Res<typeof UPDATE_USER>);
    const warning = 'This person will see no records until you pick who they are in HR.';
    renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />);
    expect(screen.getByRole('heading', { level: 2, name: /^Who is this person in HR\?/ })).toBeTruthy();
    // HR officer sees the whole school: no warning.
    expect(screen.queryByText(warning)).toBeNull();

    await user.click(roleBox('Stage head'));
    expect(screen.getByText(warning)).toBeTruthy();
    await user.click(roleBox('Stage head'));
    expect(screen.queryByText(warning)).toBeNull();

    await user.click(roleBox('Direct manager'));
    expect(screen.getByText(warning)).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    await user.click(save);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(officer.id, { roleIds: [role('hr_officer').id, role('direct_manager').id] }),
    );
  });

  it('a scoped role with an employee record picked: no warning', () => {
    const head = account({
      ...officer,
      roles: [{ ...role('stage_head') }],
      employee: { id: 'e-2', code: 'EMP-0072', nameEn: 'Rana Mostafa', nameAr: 'رنا', photoUrl: null, gender: 'FEMALE' },
    });
    renderAccess(<UserForm basePath="/en/users" user={head} roles={ROLES} now={NOW} />);
    expect(screen.queryByText('This person will see no records until you pick who they are in HR.')).toBeNull();
  });

  it('a locked sign-in: the Status card says until when, and Unlock sign-in asks first', async () => {
    const unlock = vi.mocked(UNLOCK_SIGN_IN);
    unlock.mockResolvedValue(ok({ ...officer, lockedUntil: null }) as Res<typeof UNLOCK_SIGN_IN>);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const locked = { ...officer, lockedUntil: '2026-11-17T12:15:00.000Z' };
    renderAccess(<UserForm basePath="/en/users" user={locked} roles={ROLES} now={NOW} />);
    expect(screen.getByText('Sign-in locked')).toBeTruthy();
    expect(
      screen.getByText('Too many wrong passwords. Sign-in is locked until 2:15 PM, unless you unlock it.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Unlock sign-in' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unlock sign-in for Rania Magdy?' });
    await user.click(within(dialog).getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(unlock).toHaveBeenCalledWith(officer.id));
  });

  it('editing: Status and Password come before Account, so a phone reads a locked sign-in first', () => {
    renderAccess(<UserForm basePath="/en/users" user={{ ...officer, lockedUntil: '2026-11-17T12:15:00.000Z' }} roles={ROLES} now={NOW} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 3)).toEqual(['Status', 'Password', 'Account']);
  });

  it('a locked sign-in without core.users.manage: the notice, no Unlock button', () => {
    renderAccess(
      <UserForm basePath="/en/users" user={{ ...officer, lockedUntil: '2026-11-17T12:15:00.000Z' }} roles={ROLES} now={NOW} />,
      'en',
      sessionWithout('core.users.manage'),
    );
    expect(screen.getByText('Sign-in locked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlock sign-in' })).toBeNull();
  });

  it('without core.users.manage the page is read-only', () => {
    renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />, 'en', sessionWithout('core.users.manage'));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect((screen.getByRole('textbox', { name: /Full name/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Deactivate account/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /temporary password/ })).toBeNull();
  });

  describe('H1 — the access ceiling, as the screen shows it (security review, owner 2026-11-23)', () => {
    // A user manager who isn't a System admin, holding what an HR officer holds.
    const manager = sessionWith('core.users.view', 'core.users.manage', ...role('hr_officer').permissions.map((g) => g.key));

    it('a non-System-admin can’t tick the System admin role or a role beyond their own; their own level can', async () => {
      renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />, 'en', manager);
      expect((roleBox('System admin') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Only a System admin can give or take away this role.')).toBeTruthy();
      expect((roleBox('HR manager') as HTMLButtonElement).disabled).toBe(true);
      expect((roleBox('HR officer') as HTMLButtonElement).disabled).toBe(false);
    });

    it('a System admin’s account is view-only for them, saying why', () => {
      renderAccess(<UserForm basePath="/en/users" user={account()} roles={ROLES} now={NOW} />, 'en', manager);
      expect(screen.getByTestId('beyond-access-note').textContent).toContain('Only a System admin can change');
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Deactivate account/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /temporary password/ })).toBeNull();
    });

    it('nobody changes their own roles; a System admin may still link their own employee record', () => {
      const me = account({ id: TEST_SESSION.id });
      renderAccess(<UserForm basePath="/en/users" user={me} roles={ROLES} now={NOW} />);
      expect((roleBox('HR officer') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getAllByTestId('own-access-note')).toHaveLength(1);
      expect((screen.getByRole('combobox', { name: /Employee/ }) as HTMLButtonElement).disabled).toBe(false);
      // The name can still change.
      expect((screen.getByRole('textbox', { name: /Full name/ }) as HTMLInputElement).disabled).toBe(false);
    });

    it('H-1 — only a System admin chooses the employee record: locked for a user manager, saying why', () => {
      renderAccess(<UserForm basePath="/en/users" user={officer} roles={ROLES} now={NOW} />, 'en', manager);
      expect((screen.getByRole('combobox', { name: /Employee/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId('employee-link-note').textContent).toBe('Only a System admin can choose who an account is in HR.');
    });
  });
});
