// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { PenaltyGroup, Violation } from '@school-erp/shared';
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
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { chooseRowAction } from '@/test/row-actions';

import { CatalogueSection } from '../components/catalogue-section';
import { highlightParts, searchCatalogue } from '../lib/catalogue-search';
import { deferred, ok, renderSettings } from './helpers';

const v = (id: string, nameEn: string, nameAr: string, oncePerDay = true): Violation => ({
  id,
  nameEn,
  nameAr,
  note: null,
  isActive: true,
  oncePerDay,
  levels: [{ level: 1, action: 'NOTICE', days: null }],
});

const catalogue: PenaltyGroup[] = [
  {
    id: 'g-gen',
    nameEn: 'General violations',
    nameAr: 'المخالفات العامة',
    sortOrder: 1,
    isActive: true,
    violations: [v('v-gum', 'Chewing gum', 'مضغ العلكة'), v('v-phone', 'Using a phone in a lesson', 'استعمال الجوال في الدرس')],
  },
  {
    id: 'g-edu',
    nameEn: 'Educational violations',
    nameAr: 'المخالفات التعليمية',
    sortOrder: 2,
    isActive: true,
    violations: [v('v-late', 'Late to lesson', 'التأخير عن الدرس', false), v('v-absent', 'Skipping a lesson', 'التغيب عن الدرس')],
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const search = (name: RegExp | string = 'Search violations') => screen.getByRole('searchbox', { name });
const groupHeader = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('searchCatalogue', () => {
  it('matches violation names in either language, keeps whole groups whose name matches, drops the rest', () => {
    expect(searchCatalogue(catalogue, 'phone').map((m) => [m.group.id, m.group.violations.map((x) => x.id)])).toEqual([
      ['g-gen', ['v-phone']],
    ]);
    // Arabic, typed without the hamza.
    expect(searchCatalogue(catalogue, 'التاخير').map((m) => m.group.violations.map((x) => x.id))).toEqual([['v-late']]);
    // "lesson" is in one violation of the first group and two of the second.
    expect(searchCatalogue(catalogue, 'LESSON').map((m) => m.group.violations.length)).toEqual([1, 2]);
    // The group's own name: all its violations.
    expect(searchCatalogue(catalogue, 'التعليمية')).toEqual([{ group: catalogue[1], groupMatched: true }]);
    expect(searchCatalogue(catalogue, 'nothing like this')).toEqual([]);
    expect(searchCatalogue(catalogue, '  ')).toHaveLength(2);
  });

  it('highlight parts: the first plain occurrence, case-insensitive; none when only folding matched', () => {
    expect(highlightParts('Late to lesson', 'LESSON')).toEqual(['Late to ', 'lesson', '']);
    expect(highlightParts('أحمد', 'احمد')).toBeNull();
    expect(highlightParts('anything', '')).toBeNull();
  });
});

// Typing whole words through the UI: generous under a busy CI machine.
describe('Penalty catalogue search', { timeout: 20_000 }, () => {
  it('filters by English name: matching groups open and show only the matches, with the match marked; Clear filters resets', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />);
    await screen.findByText('General violations');

    await user.type(search(), 'lesson');
    // Both groups have a match, so both open by themselves.
    expect(groupHeader('General violations').getAttribute('aria-expanded')).toBe('true');
    expect(groupHeader('Educational violations').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText('Chewing gum')).toBeNull();
    expect(screen.getByText('Late to', { exact: false })).toBeTruthy();
    expect(screen.getAllByText('lesson', { selector: 'mark' }).length).toBeGreaterThanOrEqual(3);
    // The header still says how many the group holds, then how many match.
    expect(within(groupHeader('General violations')).getByText(/2 violations · 1 matching/)).toBeTruthy();
    // Adding a violation waits until the search is cleared.
    expect(screen.queryByRole('button', { name: 'Add violation' })).toBeNull();

    // A group can still be folded by hand while searching.
    await user.click(groupHeader('General violations'));
    expect(groupHeader('General violations').getAttribute('aria-expanded')).toBe('false');

    await user.click(screen.getByRole('button', { name: /Clear filters · 1/ }));
    expect((search() as HTMLInputElement).value).toBe('');
    // Back to the folded catalogue.
    expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
  });

  it('Arabic: matches Arabic and English names and group names; no match shows the empty state with Clear filters', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />, 'ar');
    await screen.findByText('المخالفات العامة');
    const box = search('البحث في المخالفات');

    await user.type(box, 'العلكة');
    expect(screen.getByText('العلكة', { selector: 'mark' })).toBeTruthy();
    expect(screen.queryByText('استعمال الجوال في الدرس')).toBeNull();
    expect(screen.queryByText('المخالفات التعليمية')).toBeNull();

    // An English name on the Arabic screen finds it too (its English name shows under it).
    await user.clear(box);
    await user.type(box, 'phone');
    expect(screen.getByText('استعمال الجوال في الدرس')).toBeTruthy();

    // A group's name: the whole group.
    await user.clear(box);
    await user.type(box, 'التعليمية');
    expect(screen.getByText('التأخير عن الدرس')).toBeTruthy();
    expect(screen.getByText('التغيب عن الدرس')).toBeTruthy();

    await user.clear(box);
    await user.type(box, 'لا شيء يطابق');
    expect(screen.getByText('لا توجد مخالفات مطابقة')).toBeTruthy();
    const clears = screen.getAllByRole('button', { name: /مسح عوامل التصفية/ });
    await user.click(clears[clears.length - 1]!);
    expect((box as HTMLInputElement).value).toBe('');
    expect(screen.getByText('المخالفات التعليمية')).toBeTruthy();
  });

  it('"/" focuses the search, except while typing in a field', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />);
    await screen.findByText('General violations');
    await user.keyboard('/');
    expect(document.activeElement).toBe(search());
    expect((search() as HTMLInputElement).value).toBe('');
    // Typed inside the box, "/" is just a character.
    await user.keyboard('a/b');
    expect((search() as HTMLInputElement).value).toBe('a/b');
  });

  it('while loading, the search bar is there (disabled) above the skeleton, so nothing moves', async () => {
    const pending = deferred<Awaited<ReturnType<typeof ok<PenaltyGroup[]>>>>();
    api.GET_PENALTY_GROUPS.mockImplementation(() => pending.promise);
    renderSettings(<CatalogueSection />);
    expect(search()).toHaveProperty('disabled', true);
    pending.resolve(await ok(catalogue));
    await screen.findByText('General violations');
    expect(search()).toHaveProperty('disabled', false);
  });
});

describe('Once per day (§4)', { timeout: 20_000 }, () => {
  it('only a violation that can repeat in a day shows the badge', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />);
    await user.type(await screen.findByRole('searchbox', { name: 'Search violations' }), 'lesson');
    // The search filters (and opens the matching groups) after typing: wait for it, don't race it.
    await waitFor(() => expect(screen.getAllByText('Can repeat in a day')).toHaveLength(1));
    const lateRow = screen.getByText('Late to', { exact: false }).closest('li')!;
    expect(within(lateRow).getByText('Can repeat in a day')).toBeTruthy();
  });

  it('the switch shows the stored value with its explanation, and is sent on save (edit and create)', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    api.UPDATE_VIOLATION.mockImplementation((id: string, body: object) =>
      ok({ ...catalogue[1]!.violations.find((x) => x.id === id)!, ...body }),
    );
    api.CREATE_VIOLATION.mockImplementation((_g: string, body: object) => ok({ ...v('v-new', '', ''), ...body }));
    renderSettings(<CatalogueSection />);
    await user.click(await screen.findByRole('button', { name: /^Educational violations/ }));

    await chooseRowAction(user, 'Late to lesson', 'Edit');
    let dialog = await screen.findByRole('dialog', { name: 'Edit violation' });
    const toggle = within(dialog).getByRole('switch', { name: 'Once per day' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(within(dialog).getByText(/at most once on the same date/)).toBeTruthy();
    await user.click(toggle);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.UPDATE_VIOLATION).toHaveBeenCalledWith('v-late', expect.objectContaining({ oncePerDay: true })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Now it counts once a day: no badge.
    expect(screen.queryByText('Can repeat in a day')).toBeNull();

    // A new violation starts with the switch on.
    await user.click(screen.getAllByRole('button', { name: 'Add violation' })[0]!);
    dialog = await screen.findByRole('dialog', { name: 'Add violation' });
    expect(within(dialog).getByRole('switch', { name: 'Once per day' }).getAttribute('aria-checked')).toBe('true');
  });

  it('Arabic: the switch and the badge read natively', async () => {
    const user = userEvent.setup();
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
    renderSettings(<CatalogueSection />, 'ar');
    await user.click(await screen.findByRole('button', { name: /^المخالفات التعليمية/ }));
    expect(screen.getByText('قد تتكرر في اليوم')).toBeTruthy();
    const lateRow = screen.getByText('التأخير عن الدرس').closest('li')!;
    await user.click(within(lateRow).getByRole('button'));
    await user.click(await screen.findByRole('menuitem', { name: 'تعديل' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('switch', { name: 'مرة واحدة في اليوم' })).toBeTruthy();
  });
});
