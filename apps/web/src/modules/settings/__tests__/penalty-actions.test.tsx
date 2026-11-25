// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { PenaltyGroup } from '@school-erp/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_PENALTY_GROUPS: vi.fn(),
  CREATE_PENALTY_GROUP: vi.fn(),
  UPDATE_PENALTY_GROUP: vi.fn(),
  CREATE_VIOLATION: vi.fn(),
  UPDATE_VIOLATION: vi.fn(),
  GET_PENALTY_ACTIONS: vi.fn(),
  GET_PENALTY_ACTION_CHOICES: vi.fn(),
  CREATE_PENALTY_ACTION: vi.fn(),
  UPDATE_PENALTY_ACTION: vi.fn(),
}));
vi.mock('../apis', () => api);
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/settings',
  useSearchParams: () => nav.params,
}));

import { chooseRowAction } from '@/test/row-actions';
import { sessionWithout } from '@/test/render';
import { ACTION, actionItem, AMOUNT_ACTION, lvl, PERCENT_ACTION, SEEDED_ITEMS } from '@/test/penalty-actions';
import { CatalogueSection } from '../components/catalogue-section';
import { PenaltyActionsCard } from '../components/penalty-actions-card';
import { ok, renderSettings } from './helpers';

/** Spec 2026-11-25: the Penalty actions list, its add / rename / hide dialogs, and the level editor. */

const CHOICES = [...SEEDED_ITEMS, actionItem(PERCENT_ACTION), actionItem(AMOUNT_ACTION)];
const meta = (n: number) => ({ total: n, page: 1, limit: 20 });

const catalogue: PenaltyGroup[] = [
  {
    id: 'g1',
    nameEn: 'Attendance',
    nameAr: 'الحضور',
    sortOrder: 1,
    isActive: true,
    violations: [
      {
        id: 'v1',
        nameEn: 'Absence without notice',
        nameAr: 'الغياب دون إذن',
        note: null,
        isActive: true,
        oncePerDay: true,
        levels: [lvl(1, 'WARNING'), lvl(2, 'DEDUCT_DAYS', 1)],
      },
    ],
  },
];

beforeEach(() => {
  nav.params = new URLSearchParams();
  // One page as the API sends it (≤ 10 rows: the screen's page size).
  api.GET_PENALTY_ACTIONS.mockImplementation(() => ok(CHOICES.slice(0, 8), meta(CHOICES.length)));
  api.GET_PENALTY_ACTION_CHOICES.mockImplementation(() => ok(CHOICES));
  api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Settings → Penalty actions (the list)', () => {
  it('shows each action with its other-language name, its effect and how many levels use it — as the API paged it', async () => {
    const used = actionItem(ACTION.DEDUCT_DAYS, { code: 'DEDUCT_DAYS', levelsUsing: 12, violationsUsing: 9 });
    api.GET_PENALTY_ACTIONS.mockImplementation(() => ok([used, actionItem(PERCENT_ACTION)], meta(2)));
    renderSettings(<PenaltyActionsCard />);
    const table = await screen.findByRole('table', { name: 'Penalty actions' });
    expect(within(table).getByText('Deduct days', { selector: 'span.font-semibold' })).toBeTruthy();
    expect(within(table).getByText('خصم أيام')).toBeTruthy();
    expect(within(table).getByText('12 levels')).toBeTruthy();
    expect(within(table).getByText('Deduct % of the salary for the month')).toBeTruthy();
    // The API was asked for one page, visible ones only (Show hidden is off).
    expect(api.GET_PENALTY_ACTIONS).toHaveBeenCalledWith(expect.objectContaining({ page: 1, includeHidden: false }));
  });

  it('Show hidden puts actionsHidden=1 in the address (the API answers with hidden ones too)', async () => {
    const user = userEvent.setup();
    renderSettings(<PenaltyActionsCard />);
    await screen.findByRole('table', { name: 'Penalty actions' });
    await user.click(screen.getByRole('switch', { name: 'Show hidden' }));
    expect(nav.replace).toHaveBeenCalledWith('/en/settings?actionsHidden=1', { scroll: false });
  });

  it('read-only without hr.penalty_catalogue.manage: no Add, no row menus', async () => {
    renderSettings(<PenaltyActionsCard />, 'en', sessionWithout('hr.penalty_catalogue.manage'));
    await screen.findByRole('table', { name: 'Penalty actions' });
    expect(screen.queryByRole('button', { name: 'Add action' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });

  it('hiding an action in use asks first and says what keeps it', async () => {
    const user = userEvent.setup();
    const inv = actionItem(ACTION.INVESTIGATION, { code: 'INVESTIGATION', levelsUsing: 6, violationsUsing: 5 });
    api.GET_PENALTY_ACTIONS.mockImplementation(() => ok([inv], meta(1)));
    api.UPDATE_PENALTY_ACTION.mockImplementation(() => ok({ ...inv, isActive: false }));
    renderSettings(<PenaltyActionsCard />);
    await screen.findByRole('table', { name: 'Penalty actions' });
    await chooseRowAction(user, 'Referral to investigation', 'Hide');
    const confirm = await screen.findByRole('dialog', { name: 'Hide Referral to investigation?' });
    expect(within(confirm).getByText("Used on 6 levels in 5 violations. They keep it; it can't be picked for other levels.")).toBeTruthy();
    expect(api.UPDATE_PENALTY_ACTION).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(api.UPDATE_PENALTY_ACTION).toHaveBeenCalledWith(inv.id, { isActive: false }));
  });

  it('rename sends only the names; the effect shows read-only', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_ACTIONS.mockImplementation(() => ok([actionItem(PERCENT_ACTION)], meta(1)));
    api.UPDATE_PENALTY_ACTION.mockImplementation(() => ok(actionItem({ ...PERCENT_ACTION, nameEn: 'Pay deduction %' })));
    renderSettings(<PenaltyActionsCard />);
    await screen.findByRole('table', { name: 'Penalty actions' });
    await chooseRowAction(user, 'Salary deduction %', 'Rename');
    const dialog = await screen.findByRole('dialog', { name: 'Rename Salary deduction %' });
    expect(within(dialog).getByText(/Effect: Deduct % of the salary for the month/)).toBeTruthy();
    const en = within(dialog).getByRole('textbox', { name: /Name in English/ });
    await user.clear(en);
    await user.type(en, 'Pay deduction %');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.UPDATE_PENALTY_ACTION).toHaveBeenCalledWith(PERCENT_ACTION.id, { nameEn: 'Pay deduction %', nameAr: PERCENT_ACTION.nameAr }),
    );
  });
});

describe('Add action dialog', () => {
  it('five effects, each explained; "Deduct a %" asks which salary (default: the salary for the month); the effect is fixed later', async () => {
    const user = userEvent.setup();
    api.CREATE_PENALTY_ACTION.mockImplementation((body: object) => ok({ ...actionItem(PERCENT_ACTION), ...body }));
    renderSettings(<PenaltyActionsCard />);
    await screen.findByRole('table', { name: 'Penalty actions' });
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add penalty action' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(5);
    expect(within(dialog).getByText("The effect can't be changed later.")).toBeTruthy();
    const create = within(dialog).getByRole('button', { name: 'Create' });
    expect(create).toHaveProperty('disabled', true);

    await user.type(within(dialog).getByLabelText(/Name in English/), 'Salary deduction %');
    await user.type(within(dialog).getByLabelText(/Name in Arabic/), 'خصم نسبة من الراتب');
    // No base question until the % effect is picked.
    expect(within(dialog).queryByText('Of which salary')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: /Deduct a % of salary/ }));
    expect(within(dialog).getByText('Of which salary')).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: /Salary for the month/ }).getAttribute('aria-checked')).toBe('true');
    await user.click(within(dialog).getByRole('radio', { name: 'Basic salary' }));
    await user.click(create);
    await waitFor(() =>
      expect(api.CREATE_PENALTY_ACTION).toHaveBeenCalledWith({
        nameEn: 'Salary deduction %',
        nameAr: 'خصم نسبة من الراتب',
        effect: 'DEDUCT_PERCENT',
        percentBase: 'BASIC_SALARY',
      }),
    );
  });

  it('any other effect is sent without a base', async () => {
    const user = userEvent.setup();
    api.CREATE_PENALTY_ACTION.mockImplementation((body: object) => ok({ ...actionItem(AMOUNT_ACTION), ...body }));
    renderSettings(<PenaltyActionsCard />);
    await screen.findByRole('table', { name: 'Penalty actions' });
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add penalty action' });
    await user.type(within(dialog).getByLabelText(/Name in English/), 'Fixed deduction');
    await user.type(within(dialog).getByLabelText(/Name in Arabic/), 'خصم ثابت');
    await user.click(within(dialog).getByRole('radio', { name: /Deduct a fixed amount/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(api.CREATE_PENALTY_ACTION).toHaveBeenCalledWith({ nameEn: 'Fixed deduction', nameAr: 'خصم ثابت', effect: 'DEDUCT_AMOUNT' }),
    );
  });
});

describe('the level editor: the number field follows the action', () => {
  async function openEditor(user: ReturnType<typeof userEvent.setup>) {
    renderSettings(<CatalogueSection />);
    await user.click(await screen.findByRole('button', { name: /^Attendance/, expanded: false }));
    await chooseRowAction(user, 'Absence without notice', 'Edit');
    return screen.findByRole('dialog', { name: 'Edit violation' });
  }

  it('the picker lists the visible actions in the list order; the levels read with today’s labels', async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const select = within(dialog).getByRole('combobox', { name: /Level 2 action/ });
    expect(select.textContent).toContain('Deduct days');
    expect(api.GET_PENALTY_ACTION_CHOICES).toHaveBeenCalled();
  });

  it('switching days → % clears the number and asks for a percent, with the salary it is of; 12.345 and 101 are refused, 10 passes', async () => {
    const user = userEvent.setup();
    api.UPDATE_VIOLATION.mockImplementation(() => ok(catalogue[0]!.violations[0]!));
    const dialog = await openEditor(user);
    expect((within(dialog).getByRole('textbox', { name: /Level 2 days/ }) as HTMLInputElement).value).toBe('1');
    await user.click(within(dialog).getByRole('combobox', { name: /Level 2 action/ }));
    await user.click(await screen.findByRole('option', { name: 'Salary deduction %' }));
    const percent = await within(dialog).findByRole('textbox', { name: /Level 2 percent/ });
    // Another unit: the 1 (day) is not kept as 1%.
    await waitFor(() => expect((percent as HTMLInputElement).value).toBe(''));
    expect(within(dialog).getByText('of the salary for the month')).toBeTruthy();
    expect(await within(dialog).findByText('Enter a percent.')).toBeTruthy();
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toHaveProperty('disabled', true);

    await user.type(percent, '101');
    expect(await within(dialog).findByText('Enter a percent above 0 and up to 100, with at most two decimals.')).toBeTruthy();
    await user.clear(percent);
    await user.type(percent, '10');
    await waitFor(() => expect(save).toHaveProperty('disabled', false));
    await user.click(save);
    await waitFor(() =>
      expect(api.UPDATE_VIOLATION).toHaveBeenCalledWith('v1', expect.objectContaining({
        levels: [
          { level: 1, actionId: ACTION.WARNING.id, days: null, percent: null, amount: null },
          { level: 2, actionId: PERCENT_ACTION.id, days: null, percent: 10, amount: null },
        ],
      })),
    );
  });

  it('a fixed amount uses the shared money field (thousands grouped); Record only disables the number with "No number"', async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    expect(within(dialog).getByRole('textbox', { name: /Level 1 days/ })).toHaveProperty('disabled', true);
    expect(within(dialog).getByText('No number')).toBeTruthy();
    await user.click(within(dialog).getByRole('combobox', { name: /Level 2 action/ }));
    await user.click(await screen.findByRole('option', { name: 'Fixed deduction' }));
    const amount = await within(dialog).findByRole('textbox', { name: /Level 2 amount/ });
    await user.type(amount, '1500');
    await waitFor(() => expect((amount as HTMLInputElement).value).toBe('1,500'));
  });

  it('switching between two day actions keeps the typed days (same unit)', async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.click(within(dialog).getByRole('combobox', { name: /Level 2 action/ }));
    await user.click(await screen.findByRole('option', { name: 'Referral to investigation' }));
    const days = within(dialog).getByRole('textbox', { name: /Level 2 days/ }) as HTMLInputElement;
    expect(days.value).toBe('1');
    expect(within(dialog).getByText('Optional')).toBeTruthy();
  });

  it('a hidden action stays on the level that has it, marked "(hidden)"', async () => {
    const user = userEvent.setup();
    const hidden = { ...ACTION.INVESTIGATION, isActive: false };
    api.GET_PENALTY_ACTION_CHOICES.mockImplementation(() => ok(SEEDED_ITEMS.filter((a) => a.id !== hidden.id)));
    api.GET_PENALTY_GROUPS.mockImplementation(() =>
      ok([{ ...catalogue[0]!, violations: [{ ...catalogue[0]!.violations[0]!, levels: [lvl(1, 'WARNING'), { ...lvl(2, 'INVESTIGATION', 2), action: hidden }] }] }]),
    );
    renderSettings(<CatalogueSection />);
    await user.click(await screen.findByRole('button', { name: /^Attendance/, expanded: false }));
    expect(await screen.findByText(/2\. Referral to investigation, 2 days deducted \(hidden\)/)).toBeTruthy();
    await chooseRowAction(user, 'Absence without notice', 'Edit');
    const dialog = await screen.findByRole('dialog', { name: 'Edit violation' });
    expect(within(dialog).getByRole('combobox', { name: /Level 2 action/ }).textContent).toContain('(hidden)');
  });
});
