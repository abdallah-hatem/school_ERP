// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { ListItem, PenaltyGroup, SettingChangeItem } from '@school-erp/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_LIST_ITEMS: vi.fn(),
  CREATE_LIST_ITEM: vi.fn(),
  UPDATE_LIST_ITEM: vi.fn(),
  GET_SETTINGS_HISTORY: vi.fn(),
  GET_PENALTY_GROUPS: vi.fn(),
  CREATE_PENALTY_GROUP: vi.fn(),
  UPDATE_PENALTY_GROUP: vi.fn(),
  CREATE_VIOLATION: vi.fn(),
  UPDATE_VIOLATION: vi.fn(),
}));
vi.mock('../apis', () => api);
import { chooseRowAction, menuItemNames, openRowActions, rowActionsButton } from '@/test/row-actions';
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { CatalogueSection } from '../components/catalogue-section';
import { HistorySection } from '../components/history-section';
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

describe('Penalty catalogue editor', () => {
  it('level days are checked live with the shared rules; save is disabled until they are valid', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    api.UPDATE_VIOLATION.mockImplementation((_id: string, body: object) => ok({ ...catalogue[0]!.violations[0]!, ...body }));
    renderSettings(<CatalogueSection />);

    await screen.findByText('Late arrival');
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
    await screen.findByText('Late arrival');
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
    await screen.findByText('Late arrival');
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

describe('Managed lists (stages, departments, job titles)', () => {
  const departments: ListItem[] = [
    { id: 'd1', nameEn: 'Mathematics', nameAr: 'الرياضيات', sortOrder: 1, isActive: true },
    { id: 'd2', nameEn: 'Science', nameAr: 'العلوم', sortOrder: 2, isActive: false },
  ];

  it('hide and show send isActive; hidden items stay listed', async () => {
    const user = userEvent.setup();
    api.GET_LIST_ITEMS.mockImplementation(() => ok(departments));
    api.UPDATE_LIST_ITEM.mockImplementation((_k: string, id: string, body: object) =>
      ok({ ...departments.find((d) => d.id === id)!, ...body }),
    );
    renderSettings(<ListManager kind="departments" />);
    expect((await screen.findAllByText('Science'))[0]).toBeTruthy();
    expect(api.GET_LIST_ITEMS).toHaveBeenCalledWith('departments');

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
    api.GET_LIST_ITEMS.mockImplementation(() => ok(departments));
    api.CREATE_LIST_ITEM.mockImplementation((_k: string, body: object) => ok({ id: 'd3', isActive: true, ...body }));
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

  it('an empty list says so and offers the add action', async () => {
    api.GET_LIST_ITEMS.mockImplementation(() => ok([]));
    renderSettings(<ListManager kind="stages" />);
    expect((await screen.findAllByText('No stages yet'))[0]).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add stage' }).length).toBeGreaterThan(1);
  });
});

describe('Change history', () => {
  const rows: SettingChangeItem[] = [
    {
      id: 'h1',
      scope: 'hr',
      key: 'hr.payroll.dayDivisor',
      oldValue: 30,
      newValue: 26,
      changedBy: { id: 'u1', name: 'Rania Saeed' },
      changedAt: '2026-11-17T09:05:00Z',
    },
    {
      id: 'h2',
      scope: 'school',
      key: 'school.workingDays',
      oldValue: ['SUNDAY', 'MONDAY'],
      newValue: ['SUNDAY'],
      changedBy: null,
      changedAt: '2026-11-16T09:05:00Z',
    },
  ];

  it('lists what changed, old → new, who; the next page is requested with page 2', async () => {
    const user = userEvent.setup();
    api.GET_SETTINGS_HISTORY.mockImplementation(({ page }: { page: number }) =>
      ok(page === 1 ? rows : [], { total: 25, page, limit: 10 }),
    );
    renderSettings(<HistorySection />);
    expect((await screen.findAllByText('Day value divisor'))[0]).toBeTruthy();
    expect(screen.getAllByText('Rania Saeed')[0]).toBeTruthy();
    expect(screen.getAllByText('Sunday, Monday')[0]).toBeTruthy();
    expect(screen.getAllByText('System')[0]).toBeTruthy();
    expect(api.GET_SETTINGS_HISTORY).toHaveBeenCalledWith({ page: 1, limit: 10 });

    await user.click(screen.getAllByRole('button', { name: 'Next page' })[0]!);
    await waitFor(() => expect(api.GET_SETTINGS_HISTORY).toHaveBeenLastCalledWith({ page: 2, limit: 10 }));
  });

  it('no changes yet shows the empty state', async () => {
    api.GET_SETTINGS_HISTORY.mockImplementation(() => ok([], { total: 0, page: 1, limit: 10 }));
    renderSettings(<HistorySection />, 'ar');
    expect((await screen.findAllByText('لا توجد تغييرات بعد'))[0]).toBeTruthy();
  });
});
