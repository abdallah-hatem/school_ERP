// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { ListItem, PenaltyGroup } from '@school-erp/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_LIST_ITEMS: vi.fn(),
  CREATE_LIST_ITEM: vi.fn(),
  UPDATE_LIST_ITEM: vi.fn(),
  GET_PENALTY_GROUPS: vi.fn(),
  CREATE_PENALTY_GROUP: vi.fn(),
  UPDATE_PENALTY_GROUP: vi.fn(),
  CREATE_VIOLATION: vi.fn(),
  UPDATE_VIOLATION: vi.fn(),
}));
vi.mock('../apis', () => api);
import { chooseRowAction, menuItemNames, openRowActions, rowActionsButton } from '@/test/row-actions';
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/settings',
  useSearchParams: () => nav.params,
}));

import { CatalogueSection } from '../components/catalogue-section';
import { ListManager } from '../components/list-manager';
import { deferred, ok, renderSettings } from './helpers';

const catalogue: PenaltyGroup[] = [
  {
    id: 'g1',
    nameEn: 'General table A',
    nameAr: 'الجدول العام أ',
    sortOrder: 1,
    isActive: true,
    violations: [
      {
        id: 'v1',
        nameEn: 'Late arrival',
        nameAr: 'التأخر',
        note: null,
        isActive: true,
        oncePerDay: true,
        levels: [
          { level: 1, action: 'WARNING', days: null },
          { level: 2, action: 'DEDUCT_DAYS', days: 0.5 },
        ],
      },
    ],
  },
  { id: 'g2', nameEn: 'Table B', nameAr: 'الجدول ب', sortOrder: 2, isActive: true, violations: [] },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Groups start folded; open one by its header the way a person would. */
async function openGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  const header = await screen.findByRole('button', { name: new RegExp(`^${name}`), expanded: false });
  await user.click(header);
}

describe('Penalty catalogue editor', () => {
  it('every group starts folded; clicking a header opens it', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />);
    await screen.findByText('General table A');
    expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0);
    expect(screen.queryByText('Late arrival')).toBeNull();
    await openGroup(user, 'General table A');
    expect(await screen.findByText('Late arrival')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Table B/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('level days are checked live with the shared rules; save is disabled until they are valid', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    api.UPDATE_VIOLATION.mockImplementation((_id: string, body: object) => ok({ ...catalogue[0]!.violations[0]!, ...body }));
    renderSettings(<CatalogueSection />);

    await openGroup(user, 'General table A');
    await chooseRowAction(user, 'Late arrival', 'Edit');
    const dialog = await screen.findByRole('dialog', { name: 'Edit violation' });
    // The short title stays one line on a phone; the violation's name follows underneath.
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Late arrival');
    // The Arabic name is typed right to left, the English one left to right.
    expect(within(dialog).getByRole('textbox', { name: /Name in Arabic/ }).getAttribute('dir')).toBe('rtl');
    expect(within(dialog).getByRole('textbox', { name: /Name in English/ }).getAttribute('dir')).toBe('ltr');
    const days = within(dialog).getByRole('textbox', { name: /Level 2 days/ });
    const save = within(dialog).getByRole('button', { name: 'Save' });

    await user.clear(days);
    expect(await within(dialog).findByText('Enter the days to deduct.')).toBeTruthy();
    expect(save).toHaveProperty('disabled', true);

    await user.type(days, '0.3');
    expect(await within(dialog).findByText('Use quarter days above 0 and up to 30, like 0.25, 1 or 1.5.')).toBeTruthy();
    expect(save).toHaveProperty('disabled', true);

    // A warning takes no days: its field is disabled.
    expect(within(dialog).getByRole('textbox', { name: /Level 1 days/ })).toHaveProperty('disabled', true);

    await user.clear(days);
    await user.type(days, '1.25');
    await waitFor(() => expect(save).toHaveProperty('disabled', false));
    await user.click(save);
    await waitFor(() => expect(api.UPDATE_VIOLATION).toHaveBeenCalledTimes(1));
    expect(api.UPDATE_VIOLATION).toHaveBeenCalledWith('v1', {
      nameEn: 'Late arrival',
      nameAr: 'التأخر',
      note: null,
      oncePerDay: true,
      levels: [
        { level: 1, action: 'WARNING', days: null },
        { level: 2, action: 'DEDUCT_DAYS', days: 1.25 },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('2. Deduct days · 1.25 days')).toBeTruthy();
  });

  it('levels: at most 5, at least 1, renumbered after a removal', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />);
    await openGroup(user, 'General table A');
    await chooseRowAction(user, 'Late arrival', 'Edit');
    const dialog = await screen.findByRole('dialog');
    const add = within(dialog).getByRole('button', { name: 'Add a level' });
    await user.click(add);
    await user.click(add);
    await user.click(add);
    expect(within(dialog).getByRole('textbox', { name: /Level 5 days/ })).toBeTruthy();
    expect(add).toHaveProperty('disabled', true);

    await user.click(within(dialog).getByRole('button', { name: 'Remove level 1' }));
    expect(within(dialog).queryByRole('textbox', { name: /Level 5 days/ })).toBeNull();
    // The old level 2 (deduct 0.5) is now level 1.
    expect((within(dialog).getByRole('textbox', { name: /Level 1 days/ }) as HTMLInputElement).value).toBe('0.5');
  });

  it('retiring a group asks first, then marks it retired; restore brings it back', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    api.UPDATE_PENALTY_GROUP.mockImplementation((id: string, body: { isActive: boolean }) =>
      ok({ ...catalogue.find((g) => g.id === id)!, ...body }),
    );
    renderSettings(<CatalogueSection />);
    await screen.findByText('General table A');
    await chooseRowAction(user, 'General table A', 'Retire');
    expect(await screen.findByRole('dialog', { name: 'Retire General table A?' })).toBeTruthy();
    expect(api.UPDATE_PENALTY_GROUP).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retire' }));

    await waitFor(() => expect(api.UPDATE_PENALTY_GROUP).toHaveBeenCalledWith('g1', { isActive: false }));
    await openGroup(user, 'General table A');
    expect(await screen.findByText(/This group is retired/)).toBeTruthy();
    // A retired group offers Restore (not red) in place of Retire.
    const menu = await openRowActions(user, 'General table A');
    expect(menuItemNames(menu)).toEqual(['Rename', 'Restore']);
    expect(within(menu).queryByRole('separator')).toBeNull();
    await user.keyboard('{Escape}');
    // Violations of a retired group can't be edited or used.
    expect(screen.queryByRole('button', { name: /^Actions for Late arrival/ })).toBeNull();
  });

  it('retiring a violation sends isActive false once, even when clicked twice', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    const pending = deferred<{ success: true; status: number; data: unknown }>();
    api.UPDATE_VIOLATION.mockReturnValue(pending.promise);
    renderSettings(<CatalogueSection />);
    await openGroup(user, 'General table A');
    await chooseRowAction(user, 'Late arrival', 'Retire');
    // While it saves the ⋯ is busy and can't open again, so a second Retire can't be sent.
    await waitFor(() => expect(rowActionsButton('Late arrival')).toHaveProperty('disabled', true));
    await user.click(rowActionsButton('Late arrival'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(api.UPDATE_VIOLATION).toHaveBeenCalledTimes(1);
    expect(api.UPDATE_VIOLATION).toHaveBeenCalledWith('v1', { isActive: false });
    pending.resolve({ success: true, status: 200, data: { ...catalogue[0]!.violations[0]!, isActive: false } });
    await waitFor(() => expect(rowActionsButton('Late arrival')).toHaveProperty('disabled', false));
    expect(menuItemNames(await openRowActions(user, 'Late arrival'))).toEqual(['Edit', 'Restore']);
  });

  it('a failed load shows the error state with a retry', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockResolvedValueOnce({ success: false, status: 0, message: 'Network error', networkError: true });
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('General table A')).toBeTruthy();
  });
});

/**
 * The API's side of a list: it pages (`page`, `limit`, by order) and keeps what is created — the
 * screen only shows the page it answers.
 */
function serverList<T extends { sortOrder: number }>(start: T[]) {
  const items = [...start];
  api.GET_LIST_ITEMS.mockImplementation((_k: string, q: { page?: number; limit?: number } = {}) => {
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    return ok(sorted.slice((page - 1) * limit, page * limit), { total: items.length, page, limit });
  });
  api.CREATE_LIST_ITEM.mockImplementation((_k: string, body: object) => {
    const created = { id: `new-${items.length}`, isActive: true, ...body } as unknown as T;
    items.push(created);
    return ok(created);
  });
  return items;
}

describe('Managed lists (stages, departments, job titles)', () => {
  const departments: ListItem[] = [
    { id: 'd1', nameEn: 'Mathematics', nameAr: 'الرياضيات', sortOrder: 1, isActive: true },
    { id: 'd2', nameEn: 'Science', nameAr: 'العلوم', sortOrder: 2, isActive: false },
  ];

  it('hide and show send isActive; hidden items stay listed', async () => {
    const user = userEvent.setup();
    serverList(departments);
    api.UPDATE_LIST_ITEM.mockImplementation((_k: string, id: string, body: object) =>
      ok({ ...departments.find((d) => d.id === id)!, ...body }),
    );
    renderSettings(<ListManager kind="departments" />);
    expect((await screen.findAllByText('Science'))[0]).toBeTruthy();
    // One page from the API, hidden items too.
    expect(api.GET_LIST_ITEMS).toHaveBeenCalledWith('departments', { page: 1, limit: 10 });

    // A shown item: Rename, then Hide in red after the divider.
    const menu = await openRowActions(user, 'Mathematics');
    expect(menuItemNames(menu)).toEqual(['Rename', 'Hide']);
    expect(within(menu).getByRole('separator')).toBeTruthy();
    await user.click(within(menu).getByRole('menuitem', { name: 'Hide' }));
    await waitFor(() => expect(api.UPDATE_LIST_ITEM).toHaveBeenCalledWith('departments', 'd1', { isActive: false }));
    await waitFor(() => expect(rowActionsButton('Mathematics')).toHaveProperty('disabled', false));
    expect(menuItemNames(await openRowActions(user, 'Mathematics'))).toEqual(['Rename', 'Show']);
    await user.keyboard('{Escape}');
    await chooseRowAction(user, 'Science', 'Show');
    await waitFor(() => expect(api.UPDATE_LIST_ITEM).toHaveBeenCalledWith('departments', 'd2', { isActive: true }));
  });

  it('adding needs both names (inline errors), then creates the item at the end', async () => {
    const user = userEvent.setup();
    serverList(departments);
    renderSettings(<ListManager kind="departments" />);
    await screen.findAllByText('Science');
    await user.click(screen.getAllByRole('button', { name: 'Add department' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Add department' });
    const create = within(dialog).getByRole('button', { name: 'Create' });

    await user.type(within(dialog).getByRole('textbox', { name: /Name in English/ }), 'Arabic');
    await user.type(within(dialog).getByRole('textbox', { name: /Name in Arabic/ }), 'x');
    await user.clear(within(dialog).getByRole('textbox', { name: /Name in Arabic/ }));
    expect(await within(dialog).findByText('This field is required.')).toBeTruthy();
    expect(create).toHaveProperty('disabled', true);

    await user.type(within(dialog).getByRole('textbox', { name: /Name in Arabic/ }), 'اللغة العربية');
    await user.click(create);
    await waitFor(() =>
      expect(api.CREATE_LIST_ITEM).toHaveBeenCalledWith('departments', { nameEn: 'Arabic', nameAr: 'اللغة العربية', sortOrder: 3 }),
    );
    expect((await screen.findAllByText('اللغة العربية'))[0]).toBeTruthy();
  });

  it('job titles: the Manages people switch is sent on create and edit; the list shows a badge', async () => {
    const user = userEvent.setup();
    const titles = [
      { id: 'j1', nameEn: 'Principal', nameAr: 'مدير المدرسة', sortOrder: 1, isActive: true, managesPeople: true },
      { id: 'j2', nameEn: 'Teacher', nameAr: 'معلم', sortOrder: 2, isActive: true, managesPeople: false },
    ];
    serverList(titles);
    api.UPDATE_LIST_ITEM.mockImplementation((_k: string, id: string, body: object) =>
      ok({ ...titles.find((t) => t.id === id)!, ...body }),
    );
    renderSettings(<ListManager kind="jobTitles" />);
    await screen.findAllByText('Teacher');
    // Only the managing title has the badge (the table and the phone cards each draw it once).
    const badges = () => screen.getAllByText('Manages people').length;
    const perLayout = badges();
    expect(screen.getAllByText('Principal')).toHaveLength(perLayout);

    // Edit (not just rename): turn the switch on for Teacher.
    const menu = await openRowActions(user, 'Teacher');
    expect(menuItemNames(menu)).toEqual(['Edit', 'Hide']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Teacher' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    const toggle = within(dialog).getByRole('switch', { name: 'Manages people' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(save).toHaveProperty('disabled', true);
    await user.click(toggle);
    await waitFor(() => expect(save).toHaveProperty('disabled', false));
    await user.click(save);
    await waitFor(() =>
      expect(api.UPDATE_LIST_ITEM).toHaveBeenCalledWith('jobTitles', 'j2', {
        nameEn: 'Teacher',
        nameAr: 'معلم',
        managesPeople: true,
      }),
    );
    await waitFor(() => expect(badges()).toBe(perLayout * 2));

    // Create: off unless switched on.
    await user.click(screen.getAllByRole('button', { name: 'Add job title' })[0]!);
    const add = await screen.findByRole('dialog', { name: 'Add job title' });
    await user.type(within(add).getByRole('textbox', { name: /Name in English/ }), 'Nurse');
    await user.type(within(add).getByRole('textbox', { name: /Name in Arabic/ }), 'ممرضة');
    await user.click(within(add).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(api.CREATE_LIST_ITEM).toHaveBeenCalledWith('jobTitles', {
        nameEn: 'Nurse',
        nameAr: 'ممرضة',
        managesPeople: false,
        sortOrder: 3,
      }),
    );
  });

  it('job titles in Arabic: the switch and badge read natively; departments have no switch', async () => {
    const user = userEvent.setup();
    serverList([{ id: 'j1', nameEn: 'Principal', nameAr: 'مدير المدرسة', sortOrder: 1, isActive: true, managesPeople: true }]);
    renderSettings(<ListManager kind="jobTitles" />, 'ar');
    expect((await screen.findAllByText('يدير موظفين')).length).toBeGreaterThan(0);
    await chooseRowAction(user, /^إجراءات مدير المدرسة/, 'تعديل');
    const dialog = await screen.findByRole('dialog', { name: 'تعديل مدير المدرسة' });
    expect(within(dialog).getByRole('switch', { name: 'يدير موظفين' }).getAttribute('aria-checked')).toBe('true');
    cleanup();

    serverList(departments);
    renderSettings(<ListManager kind="departments" />);
    await screen.findAllByText('Science');
    await chooseRowAction(user, 'Mathematics', 'Rename');
    const rename = await screen.findByRole('dialog', { name: 'Rename Mathematics' });
    expect(within(rename).queryByRole('switch')).toBeNull();
  });

  it('pages through the API: the page goes in the URL beside the section; only that page shows', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, nameEn: `Dept ${i + 1}`, nameAr: `قسم ${i + 1}`, sortOrder: i + 1, isActive: true }));
    serverList(many);
    nav.params = new URLSearchParams('section=lists&departmentsPage=2');
    renderSettings(<ListManager kind="departments" />);
    expect((await screen.findAllByText('Dept 11'))[0]).toBeTruthy();
    expect(screen.queryByText('Dept 1')).toBeNull();
    expect(api.GET_LIST_ITEMS).toHaveBeenCalledWith('departments', { page: 2, limit: 10 });
    await user.click(screen.getByRole('button', { name: 'Page 1' }));
    expect(nav.replace).toHaveBeenCalledWith('/en/settings?section=lists', { scroll: false });
    nav.params = new URLSearchParams();
  });

  it('an empty list says so and offers the add action', async () => {
    api.GET_LIST_ITEMS.mockImplementation(() => ok([], { total: 0, page: 1, limit: 10 }));
    renderSettings(<ListManager kind="stages" />);
    expect((await screen.findAllByText('No stages yet'))[0]).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add stage' }).length).toBeGreaterThan(1);
  });
});
