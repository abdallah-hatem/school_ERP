// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET_SCHOOL_CALENDAR: vi.fn(), PUT_SCHOOL_CALENDAR: vi.fn() }));
vi.mock('../apis', () => api);
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { SchoolCalendarCard } from '../components/school-calendar-card';
import { ok, renderSettings } from './helpers';

const CALENDAR = { term1Start: '2026-09-20', term1End: '2027-01-28', term2Start: '2027-02-07', nonRenewalDeadline: '2027-04-30' };

describe('Settings → HR rules → School calendar (contracts)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-11-24T10:00:00Z') });
    api.GET_SCHOOL_CALENDAR.mockImplementation((year: number) => ok({ year, calendar: year === 2026 ? CALENDAR : null }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('opens on the current contract year with its four saved dates', async () => {
    renderSettings(<SchoolCalendarCard />);
    expect(await screen.findByRole('button', { name: /Last day of term 1/ })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(api.GET_SCHOOL_CALENDAR).toHaveBeenCalledWith(2026);
    expect(screen.getByRole('group', { name: 'Contract year' }).textContent).toContain('2026/27');
    expect(screen.getByRole('button', { name: /First day of term 1/ }).textContent).toMatch(/20 Sept? 2026/);
    expect(screen.getByRole('button', { name: /Non-renewal deadline/ }).textContent).toContain('30 Apr 2027');
  });

  it('another year is read from the API; one not set yet says so', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSettings(<SchoolCalendarCard />);
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Next year' }));
    await waitFor(() => expect(api.GET_SCHOOL_CALENDAR).toHaveBeenCalledWith(2027));
    expect(await screen.findByText(/Not set for 2027\/28 yet\./)).toBeTruthy();
  });
});
