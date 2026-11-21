// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), prefetch: vi.fn() }),
}));
// The person pickers' choices come from the API (searched there, never here).
const auditApis = vi.hoisted(() => ({ GET_AUDIT_ACTORS: vi.fn() }));
vi.mock('@/core/audit/apis', () => auditApis);
vi.mock('next/link', async () => ({ default: (await import('@/core/audit/test/fixtures')).MockLink }));

import type { AuditEntry } from '@school-erp/shared';
import { ACTORS, AHMED, entry, MONA, NOW, renderAudit } from '@/core/audit/test/fixtures';

/** The API's side of the people picker: the log's people, searched by name. */
function serveActors() {
  auditApis.GET_AUDIT_ACTORS.mockImplementation(async (q: { search?: string } = {}) => ({
    success: true,
    status: 200,
    data: ACTORS.filter((a) => a.name.toLowerCase().includes((q.search ?? '').toLowerCase())),
  }));
}
import { parseActivityQuery } from '../lib/query';
import { ActivityView } from './activity-view';

const summary = { actions: 6, people: 4, money: 2, failedSignIns: 1 };

function renderView(
  params: Record<string, string> = {},
  entries: AuditEntry[] = [entry()],
  { total = entries.length, locale = 'en' as 'en' | 'ar', error = false } = {},
) {
  return renderAudit(
    <ActivityView
      basePath={`/${locale}/activity`}
      query={parseActivityQuery(params)}
      entries={entries}
      total={total}
      actors={ACTORS}
      summary={summary}
      now={NOW}
      error={error}
    />,
    locale,
  );
}

/** The side panel (the sheet holds the same controls on a phone). */
const panel = () => screen.getByRole('complementary', { name: 'Filters' });

describe('Activity page', () => {
  beforeEach(() => {
    serveActors();
    push.mockReset();
    refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    ['en', ['All', 'School', 'HR', 'Accounting', 'Settings'], 'Accounting'],
    ['ar', ['الكل', 'المدرسة', 'الموارد البشرية', 'المحاسبة', 'الإعدادات'], 'المحاسبة'],
  ] as const)('the module filter has Accounting, for the return and finalize entries (%s)', async (locale, names, accounting) => {
    const user = userEvent.setup();
    renderView({}, [entry()], { locale });
    const group = within(screen.getByRole('complementary')).getByRole('group', { name: locale === 'en' ? 'Module' : 'القسم' });
    const buttons = within(group).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(names);
    // Five segments don't fit the panel in one row: they wrap instead of running out of it.
    expect(within(group).getByRole('button', { name: accounting }).parentElement!.className).toContain('flex-wrap');
    await user.click(within(group).getByRole('button', { name: accounting }));
    expect(push).toHaveBeenLastCalledWith(`/${locale}/activity?module=accounting`, { scroll: false });
  });

  it('each filter goes into the URL from page 1, without scrolling', async () => {
    const user = userEvent.setup();
    renderView({ page: '3' });
    await user.click(within(panel()).getByRole('button', { name: 'HR' }));
    expect(push).toHaveBeenLastCalledWith('/en/activity?module=hr', { scroll: false });

    await user.click(within(panel()).getByRole('button', { name: 'Changed' }));
    expect(push).toHaveBeenLastCalledWith('/en/activity?type=update', { scroll: false });

    await user.click(await within(panel()).findByRole('button', { name: 'Ahmed Mahmoud' }));
    expect(push).toHaveBeenLastCalledWith(`/en/activity?person=${AHMED.id}`, { scroll: false });
    // The people came from the API's first page.
    expect(auditApis.GET_AUDIT_ACTORS).toHaveBeenCalledWith({ search: undefined, limit: 20 });

    await user.click(within(panel()).getByRole('button', { name: /Date range/ }));
    await user.click(await screen.findByRole('button', { name: 'Last 7 days' }));
    expect(push).toHaveBeenLastCalledWith('/en/activity?from=2026-11-11&to=2026-11-17', { scroll: false });
  });

  it('chips add up and toggle off; the person picker searches and "Anyone" clears it', async () => {
    const user = userEvent.setup();
    renderView({ type: 'create', person: MONA.id });
    expect(within(panel()).getByRole('button', { name: 'Added' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(within(panel()).getByRole('button', { name: 'Signed in' }));
    expect(push).toHaveBeenLastCalledWith(`/en/activity?type=create%2CsignIn&person=${MONA.id}`, { scroll: false });
    await user.click(within(panel()).getByRole('button', { name: 'Added' }));
    expect(push).toHaveBeenLastCalledWith(`/en/activity?person=${MONA.id}`, { scroll: false });

    await within(panel()).findByRole('button', { name: 'Mona Ibrahim' });
    await user.type(within(panel()).getByRole('searchbox', { name: 'Search people' }), 'ahm');
    await waitFor(() => expect(auditApis.GET_AUDIT_ACTORS).toHaveBeenLastCalledWith({ search: 'ahm', limit: 20 }));
    await waitFor(() => expect(within(panel()).queryByRole('button', { name: 'Mona Ibrahim' })).toBeNull());
    await user.clear(within(panel()).getByRole('searchbox', { name: 'Search people' }));
    await user.click(within(panel()).getByRole('button', { name: 'Anyone' }));
    expect(push).toHaveBeenLastCalledWith('/en/activity?type=create', { scroll: false });
  });

  it('search waits for typing to pause, then searches from page 1', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderView({ page: '2', module: 'core' });
    await user.type(screen.getByRole('searchbox', { name: 'Search the record' }), 'Omar');
    expect(push).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/en/activity?q=Omar&module=core', { scroll: false });
  });

  it('pages on the server: next page keeps the filters and the scroll', async () => {
    const user = userEvent.setup();
    renderView({ module: 'hr' }, Array.from({ length: 10 }, () => entry()), { total: 24 });
    expect(screen.getByText('Showing 1–10 of 24')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(push).toHaveBeenCalledWith('/en/activity?module=hr&page=2', { scroll: false });
  });

  it('empty: "nothing yet" without filters; "no results" with a way to clear them', async () => {
    const user = userEvent.setup();
    renderView({}, []);
    expect(screen.getByText('Nothing recorded yet')).toBeTruthy();
    expect(screen.queryByText('No activity matches these filters')).toBeNull();
    cleanup();

    renderView({ person: AHMED.id, module: 'hr', q: 'zzz' }, []);
    expect(screen.getByText('No activity matches these filters')).toBeTruthy();
    const section = screen.getByRole('region', { name: 'Activity' });
    // Search + person + module: the count covers the search too, and one click resets all three.
    push.mockClear();
    await user.click(within(section).getByRole('button', { name: 'Clear filters · 3' }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenLastCalledWith('/en/activity', { scroll: false });
    expect((screen.getByRole('searchbox', { name: 'Search the record' }) as HTMLInputElement).value).toBe('');
  });

  it('a failed load offers a retry; today at a glance shows the counts', async () => {
    const user = userEvent.setup();
    renderView({}, [], { error: true });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalled();
    const glance = within(panel()).getByTestId('today-at-a-glance');
    expect(glance.textContent).toBe('6Actions4People active2Money changes1Failed sign-ins');
  });

  it('phone: the filters in use show as chips that remove themselves', async () => {
    const user = userEvent.setup();
    renderView({ module: 'settings', person: MONA.id });
    expect(screen.getByRole('button', { name: 'Filters, 2 on' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove filter: Settings' }));
    expect(push).toHaveBeenLastCalledWith(`/en/activity?person=${MONA.id}`, { scroll: false });
  });

  it('Arabic: mirrored, translated filters', () => {
    renderView({}, [entry()], { locale: 'ar' });
    expect(document.documentElement.dir).toBe('rtl');
    expect(within(screen.getByRole('complementary', { name: 'الفلاتر' })).getByRole('button', { name: 'الموارد البشرية' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'البحث عن السجل' })).toBeTruthy();
    expect(screen.getByText('سجل النشاط')).toBeTruthy();
  });

  it('counts read as "1 entry" / "24 entries", and in Arabic plural forms', () => {
    renderView({}, [entry()], { total: 1 });
    expect(screen.getByText('1 entry')).toBeTruthy();
    cleanup();
    renderView({}, [entry()], { total: 24 });
    expect(screen.getByText('24 entries')).toBeTruthy();
    cleanup();
    renderView({}, [entry()], { total: 2, locale: 'ar' });
    expect(screen.getByText('سجلان')).toBeTruthy();
  });

  it('phone row: the count stays outside the sideways-scrolling chips, so it is never cut (EN and AR)', () => {
    for (const locale of ['en', 'ar'] as const) {
      renderView({ module: 'hr', type: 'create,update', person: AHMED.id }, [entry()], { total: 1284, locale });
      const count = screen.getByTestId('activity-total');
      const chips = screen.getByTestId('activity-chips');
      expect(count.textContent).toMatch(/1,284/);
      expect(chips.contains(count)).toBe(false);
      // The chips (and "Clear filters") are what scrolls.
      expect(chips.className).toMatch(/overflow-x-auto/);
      expect(chips.querySelectorAll('button').length).toBeGreaterThanOrEqual(4);
      // Nothing that holds the count scrolls sideways.
      for (let el = count.parentElement; el; el = el.parentElement) expect(el.className).not.toMatch(/overflow-x-auto/);
      cleanup();
    }
  });

  it('no results: no paging and no "0 entries"; the message names every active cause', () => {
    renderView({ person: AHMED.id, module: 'hr', type: 'create,update', from: '2026-11-01', to: '2026-11-17', q: 'zzz' }, [], {
      total: 0,
    });
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
    expect(screen.queryByText(/0 entries/)).toBeNull();
    expect(screen.getByText(/^Nothing matches/).textContent).toBe(
      'Nothing matches the search “zzz”, the person Ahmed Mahmoud, the module HR, the action type Added, Changed and the dates 1–17 Nov 2026. Remove one of them or clear all filters.',
    );
  });

  it('keyboard order: the filters panel comes before the timeline it narrows', () => {
    renderView();
    const filters = panel();
    const timeline = screen.getByRole('region', { name: 'Activity' });
    expect(filters.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the filters sheet has a close button and keeps "Clear filters"', async () => {
    const user = userEvent.setup();
    renderView({ module: 'hr' });
    await user.click(screen.getByRole('button', { name: 'Filters, 1 on' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(sheet).getByRole('button', { name: 'Clear filters' })).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Close filters' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
