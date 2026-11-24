// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), redirect: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({
  RENEW_CONTRACTS: vi.fn(),
  NOT_RENEW_CONTRACT: vi.fn(),
  REQUEST_EARLY_TERMINATION: vi.fn(),
  UPLOAD_CONTRACT_FILE: vi.fn(),
  GET_SCHOOL_CALENDAR: vi.fn(),
}));
vi.mock('../apis', () => api);

// Spy on the shared rules (keeping their behaviour) to prove the sheet has no copy of its own.
const shared = vi.hoisted(() => ({ noticeTiming: vi.fn(), earlyTerminationTiming: vi.fn() }));
vi.mock('@school-erp/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@school-erp/shared')>();
  shared.noticeTiming.mockImplementation(actual.noticeTiming);
  shared.earlyTerminationTiming.mockImplementation(actual.earlyTerminationTiming);
  return { ...actual, noticeTiming: shared.noticeTiming, earlyTerminationTiming: shared.earlyTerminationTiming };
});

import type { SchoolCalendarDates } from '@school-erp/shared';
import type { DecisionChoice } from '../lib/decision-form';
import { calendar, contract, failure, ok, renderContracts } from '../test/fixtures';
import { DecisionSheet } from './decision-sheet';

const ALL: DecisionChoice[] = ['RENEW', 'NOT_RENEWING', 'NOTICE', 'EARLY_TERMINATION'];

function renderSheet(
  props: { choice?: DecisionChoice; calendar?: SchoolCalendarDates | null } = {},
  locale: 'en' | 'ar' = 'en',
) {
  const onDone = vi.fn();
  renderContracts(
    <DecisionSheet
      contract={contract()}
      choice={props.choice}
      choices={ALL}
      calendar={'calendar' in props ? props.calendar : calendar}
      onClose={vi.fn()}
      onDone={onDone}
    />,
    locale,
  );
  return { onDone };
}

describe('DecisionSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-11-24T10:00:00Z') });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('the four choices, the one picked from the menu already on', () => {
    renderSheet({ choice: 'NOTICE' });
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([
      'Renew',
      "Not renewing — school's decision",
      'Employee gave notice',
      'Early termination request',
    ]);
    expect(screen.getByRole('radio', { name: 'Employee gave notice' }).getAttribute('aria-checked')).toBe('true');
  });

  it("an employee's notice received before term 2 is marked Early, with the shared noticeTiming", () => {
    renderSheet({ choice: 'NOTICE' });
    // Today (24 Nov 2026) is before term 2 (7 Feb 2027).
    const line = screen.getByTestId('decision-timing');
    expect(line.textContent).toBe('Received before term 2 starts (7 Feb 2027) — it will be recorded and marked “Early”. The school decides case by case.');
    expect(shared.noticeTiming).toHaveBeenCalledWith('2026-11-24', calendar);
  });

  it('after the deadline it is marked Late', () => {
    vi.setSystemTime(new Date('2027-05-10T10:00:00Z'));
    renderSheet({ choice: 'NOTICE' });
    expect(screen.getByTestId('decision-timing').textContent).toContain('marked “Late”');
    expect(screen.getByTestId('decision-timing').textContent).toContain('30 Apr 2027');
  });

  it('with no calendar for the year it is marked "Calendar not set"', () => {
    renderSheet({ choice: 'NOTICE', calendar: null });
    expect(screen.getByTestId('decision-timing').textContent).toBe(
      'The school calendar for 2026/27 isn\'t set — it will be recorded and marked “Calendar not set”.',
    );
  });

  it('an early termination request inside term 1 says where the contract would end', () => {
    renderSheet({ choice: 'EARLY_TERMINATION' });
    expect(screen.getByTestId('decision-timing').textContent).toBe('If approved, the contract ends on 28 Jan 2027, the last day of term 1.');
    expect(shared.earlyTerminationTiming).toHaveBeenCalledWith('2026-11-24', calendar);
  });

  it('without the calendar on the screen, the sheet asks the API for the contract year’s', async () => {
    api.GET_SCHOOL_CALENDAR.mockResolvedValue(ok({ year: 2026, calendar: null }));
    renderSheet({ choice: 'NOTICE', calendar: undefined });
    await waitFor(() => expect(api.GET_SCHOOL_CALENDAR).toHaveBeenCalledWith(2026));
    expect((await screen.findByTestId('decision-timing')).textContent).toContain('Calendar not set');
  });

  it("saving the employee's notice sends the date and the note, as EMPLOYEE", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.NOT_RENEW_CONTRACT.mockResolvedValue(ok(contract({ decision: 'NOTICE' })));
    const { onDone } = renderSheet({ choice: 'NOTICE' });
    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Moving abroad');
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    await waitFor(() =>
      expect(api.NOT_RENEW_CONTRACT).toHaveBeenCalledWith('c-1', {
        by: 'EMPLOYEE',
        receivedOn: '2026-11-24',
        note: 'Moving abroad',
        fileUrl: null,
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('a refusal stays open with its reason', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.NOT_RENEW_CONTRACT.mockResolvedValue(failure(403, 'OWN_CONTRACT'));
    const { onDone } = renderSheet({ choice: 'NOT_RENEWING' });
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect((await screen.findByRole('alert')).textContent).toBe("You can't decide on your own contract. Ask someone else.");
    expect(onDone).not.toHaveBeenCalled();
    expect(api.NOT_RENEW_CONTRACT).toHaveBeenCalledWith('c-1', { by: 'SCHOOL', note: null });
  });

  it('nothing picked: Save asks for a decision first', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSheet();
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(api.RENEW_CONTRACTS).not.toHaveBeenCalled();
  });

  it('reads in Arabic', () => {
    renderSheet({ choice: 'NOTICE' }, 'ar');
    expect(screen.getByRole('radio', { name: 'الموظف قدّم إخطارًا' })).toBeTruthy();
    expect(screen.getByTestId('decision-timing').textContent).toContain('«مبكر»');
  });
});

