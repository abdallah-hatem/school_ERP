// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET_HR_SETTINGS: vi.fn(), UPDATE_HR_SETTINGS: vi.fn() }));
vi.mock('../apis', () => api);
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

// Spy on the shared rule (keeping its real behaviour) to prove the preview has no copy of its own.
const shared = vi.hoisted(() => ({ latenessDays: vi.fn() }));
vi.mock('@school-erp/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@school-erp/shared')>();
  shared.latenessDays.mockImplementation(actual.latenessDays);
  return { ...actual, latenessDays: shared.latenessDays };
});

import { HrRulesSection } from '../components/hr-rules-section';
import { hrSettings, ok, renderSettings } from './helpers';

/**
 * The loaded form. "Lateness rule" alone isn't enough: the loading skeleton shows the same cards,
 * so a slow machine would act on the skeleton. Wait for the busy mask to go.
 */
async function loaded(title = 'Lateness rule') {
  await screen.findByText(title);
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}

function example() {
  return screen.getByTestId('lateness-example').textContent ?? '';
}

describe('HR rules — lateness rule editor', () => {
  beforeEach(() => {
    api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lateness rule editor shows a live example ("90 minutes → 0.75 day")', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />);
    await loaded();
    expect(example()).toContain('90 minutes → 0.75 day');

    // Edit the 2nd hour step: 0.25 + 1 = 1.25.
    const hour2 = screen.getByRole('textbox', { name: /Hour 2 costs/ });
    await user.clear(hour2);
    await user.type(hour2, '1');
    await waitFor(() => expect(example()).toContain('90 minutes → 1.25 days'));

    // Change the example minutes: 30 → 1st hour only.
    const minutes = screen.getByRole('textbox', { name: 'Minutes in a month' });
    await user.clear(minutes);
    await user.type(minutes, '30');
    expect(example()).toContain('30 minutes → 0.25 day');

    // Grace 30 → nothing left to count.
    const grace = screen.getByRole('textbox', { name: /Grace minutes/ });
    await user.clear(grace);
    await user.type(grace, '30');
    await waitFor(() => expect(example()).toContain('30 minutes → 0 days'));
  });

  it('the Save/Discard bar stays in view over the whole form only while there are unsaved changes', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />);
    await loaded();
    const bar = () => screen.getByRole('button', { name: 'Save' }).parentElement as HTMLElement;
    // A direct child of the form (spanning every card), so it can follow the whole form.
    expect(bar().parentElement?.tagName).toBe('FORM');
    expect(bar().dataset.sticky).toBeUndefined();

    const grace = screen.getByRole('textbox', { name: /Grace minutes/ });
    await user.clear(grace);
    await user.type(grace, '5');
    await waitFor(() => expect(bar().dataset.sticky).toBe('true'));

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(bar().dataset.sticky).toBeUndefined());
  });

  it('the live "days" preview uses the shared latenessDays from packages/shared (no second copy of the rule)', async () => {
    renderSettings(<HrRulesSection />);
    await loaded();
    expect(shared.latenessDays).toHaveBeenCalledWith(90, {
      graceMinutes: 0,
      steps: [
        { hour: 1, days: 0.25 },
        { hour: 2, days: 0.5 },
      ],
      extraHourDays: 0.5,
    });
  });

  it('a step of 0.3 days shows the inline error, pauses the example and blocks saving', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />);
    await loaded();
    const hour1 = screen.getByRole('textbox', { name: /Hour 1 costs/ });
    await user.clear(hour1);
    await user.type(hour1, '0.3');
    expect(await screen.findByText('Use quarter days from 0 to 30, like 0.25, 0.5 or 1.25.')).toBeTruthy();
    expect(example()).toContain('Fix the rule above to see an example.');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('adding a step and changing the divisor saves only the changed keys, hours numbered 1..n', async () => {
    const user = userEvent.setup();
    api.UPDATE_HR_SETTINGS.mockImplementation(() =>
      ok({
        ...hrSettings,
        lateness: { ...hrSettings.lateness, steps: [...hrSettings.lateness.steps, { hour: 3, days: 0.5 }] },
        payroll: { ...hrSettings.payroll, dayDivisor: 26 },
      }),
    );
    renderSettings(<HrRulesSection />);
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Add an hour step' }));
    expect(screen.getByRole('textbox', { name: /Hour 3 costs/ })).toBeTruthy();
    // 180 minutes = hours 1, 2, 3 → 0.25 + 0.5 + 0.5 (the new 3rd step).
    const minutes = screen.getByRole('textbox', { name: 'Minutes in a month' });
    await user.clear(minutes);
    await user.type(minutes, '180');
    expect(example()).toContain('180 minutes → 1.25 days');

    const divisor = screen.getByRole('textbox', { name: /Day value divisor/ });
    await user.clear(divisor);
    await user.type(divisor, '26');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.UPDATE_HR_SETTINGS).toHaveBeenCalledTimes(1));
    expect(api.UPDATE_HR_SETTINGS).toHaveBeenCalledWith({
      lateness: {
        steps: [
          { hour: 1, days: 0.25 },
          { hour: 2, days: 0.5 },
          { hour: 3, days: 0.5 },
        ],
      },
      payroll: { dayDivisor: 26 },
    });
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('a divisor of 32 or a part-time share of 0 shows its message in Arabic', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />, 'ar');
    await screen.findByText('قاعدة التأخير');
    const divisor = screen.getByRole('textbox', { name: /مقسوم قيمة اليوم/ });
    await user.clear(divisor);
    await user.type(divisor, '32');
    expect(await screen.findByText('أدخل رقمًا صحيحًا من 1 إلى 31.')).toBeTruthy();
    const pt3 = screen.getByRole('textbox', { name: /3 أيام/ });
    await user.clear(pt3);
    await user.type(pt3, '0');
    expect(await screen.findByText('أدخل نسبة صحيحة من 1 إلى 100.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'حفظ' })).toHaveProperty('disabled', true);
  });
});

describe('HR rules — tax and insurance', () => {
  beforeEach(() => {
    api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const taxExample = () => screen.getByTestId('tax-example').textContent ?? '';

  it('shows the default slices, fund and insurance share, and a live example from the shared gross-up', async () => {
    renderSettings(<HrRulesSection />);
    await loaded();
    expect(screen.getByText('Tax and insurance')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /Slice 1: the next amount/ }) as HTMLInputElement).value).toBe('5,000.00');
    expect((screen.getByRole('textbox', { name: /Slice 6 rate/ }) as HTMLInputElement).value).toBe('25');
    expect(screen.queryByRole('textbox', { name: /Slice 6: the next amount/ })).toBeNull(); // "The rest"
    expect(screen.getByText('The rest')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /Martyrs' fund/ }) as HTMLInputElement).value).toBe('0.05');
    expect((screen.getByRole('textbox', { name: /Employee insurance share/ }) as HTMLInputElement).value).toBe('11');
    // Net 10,000.00 → 1,017.00 tax, 5.51 fund, 11,022.51 gross (same numbers as the API's tests).
    expect(taxExample()).toContain('net 10,000.00 → income tax 1,017.00 · martyrs\' fund 5.51 · gross 11,022.51');
  });

  it('a slice rate plus the fund reaching 100% shows the error, pauses the example and blocks saving', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />);
    await loaded();
    const rate = screen.getByRole('textbox', { name: /Slice 6 rate/ });
    await user.clear(rate);
    await user.type(rate, '99.99');
    expect(await screen.findByText("This rate plus the martyrs' fund must stay under 100%.")).toBeTruthy();
    expect(taxExample()).toContain('Fix the tax rule above to see an example.');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('adding a slice puts it before "The rest"; saving sends the whole table (last open-ended) and only the tax keys that changed', async () => {
    const user = userEvent.setup();
    api.UPDATE_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
    renderSettings(<HrRulesSection />);
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Add a slice' }));
    // The new slice is 6th (1,000.00 at 0%); "The rest" moves to 7th.
    expect((screen.getByRole('textbox', { name: /Slice 6: the next amount/ }) as HTMLInputElement).value).toBe('1,000.00');
    const rate = screen.getByRole('textbox', { name: /Slice 6 rate/ });
    await user.clear(rate);
    await user.type(rate, '24');
    const fund = screen.getByRole('textbox', { name: /Martyrs' fund/ });
    await user.clear(fund);
    await user.type(fund, '0.1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.UPDATE_HR_SETTINGS).toHaveBeenCalledTimes(1));
    expect(api.UPDATE_HR_SETTINGS).toHaveBeenCalledWith({
      tax: {
        brackets: [
          { width: 500_000, percent: 0 },
          { width: 125_000, percent: 10 },
          { width: 125_000, percent: 15 },
          { width: 1_083_333, percent: 20 },
          { width: 1_666_667, percent: 22.5 },
          { width: 100_000, percent: 24 },
          { width: null, percent: 25 },
        ],
        martyrPercent: 0.1,
      },
    });
  });

  it('Arabic: an insurance share of 100% shows its message in Arabic', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />, 'ar');
    await loaded('قاعدة التأخير');
    const insurance = screen.getByRole('textbox', { name: /حصة العامل في التأمينات/ });
    await user.clear(insurance);
    await user.type(insurance, '100');
    expect(await screen.findByText('أدخل نسبة من 0 إلى 99.99، بحد أقصى رقمين عشريين.')).toBeTruthy();
  });
});
