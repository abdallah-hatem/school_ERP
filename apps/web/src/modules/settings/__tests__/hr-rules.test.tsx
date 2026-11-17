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

  it('lateness rule editor shows a live example ("90 minutes → 0.75 days")', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />);
    await screen.findByText('Lateness rule');
    expect(example()).toContain('90 minutes → 0.75 days');

    // Edit the 2nd hour step: 0.25 + 1 = 1.25.
    const hour2 = screen.getByRole('textbox', { name: /Hour 2 costs/ });
    await user.clear(hour2);
    await user.type(hour2, '1');
    await waitFor(() => expect(example()).toContain('90 minutes → 1.25 days'));

    // Change the example minutes: 30 → 1st hour only.
    const minutes = screen.getByRole('textbox', { name: 'Minutes in a month' });
    await user.clear(minutes);
    await user.type(minutes, '30');
    expect(example()).toContain('30 minutes → 0.25 days');

    // Grace 30 → nothing left to count.
    const grace = screen.getByRole('textbox', { name: /Grace minutes/ });
    await user.clear(grace);
    await user.type(grace, '30');
    await waitFor(() => expect(example()).toContain('30 minutes → 0 days'));
  });

  it('the live "days" preview uses the shared latenessDays from packages/shared (no second copy of the rule)', async () => {
    renderSettings(<HrRulesSection />);
    await screen.findByText('Lateness rule');
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
    await screen.findByText('Lateness rule');
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
    await screen.findByText('Lateness rule');
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
