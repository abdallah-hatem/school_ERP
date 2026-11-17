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
vi.mock('next/link', async () => ({ default: (await import('@/core/audit/test/fixtures')).MockLink }));

import type { AuditEntry } from '@school-erp/shared';
import { AHMED, entry, MONA, NOW, renderAudit } from '@/core/audit/test/fixtures';
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
      actors={[MONA, AHMED]}
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
    push.mockReset();
    refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('each filter goes into the URL from page 1, without scrolling', async () => {
    const user = userEvent.setup();
    renderView({ page: '3' });
    await user.click(within(panel()).getByRole('button', { name: 'HR' }));
    expect(push).toHaveBeenLastCalledWith('/en/activity?module=hr', { scroll: false });

    await user.click(within(panel()).getByRole('button', { name: 'Changed' }));
    expect(push).toHaveBeenLastCalledWith('/en/activity?type=update', { scroll: false });

    await user.click(within(panel()).getByRole('button', { name: 'Ahmed Mahmoud' }));
    expect(push).toHaveBeenLastCalledWith(`/en/activity?person=${AHMED.id}`, { scroll: false });

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

    await user.type(within(panel()).getByRole('searchbox', { name: 'Search people' }), 'ahm');
    expect(within(panel()).queryByRole('button', { name: 'Mona Ibrahim' })).toBeNull();
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
    await user.click(within(section).getByRole('button', { name: 'Clear filters' }));
    expect(push).toHaveBeenLastCalledWith('/en/activity', { scroll: false });
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
});
