// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_TAX_RULE, type AccountingSettings } from '@school-erp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET_ACCOUNTING_SETTINGS: vi.fn(), UPDATE_ACCOUNTING_SETTINGS: vi.fn() }));
vi.mock('../apis', () => api);
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { AccountingRulesSection } from '../components/accounting-rules-section';
import { ok, renderSettings } from './helpers';

const SETTINGS: AccountingSettings = { payroll: DEFAULT_TAX_RULE };

/** The loaded form (the skeleton shows the same card, so wait for the busy mask to go). */
async function loaded(title = 'Tax and insurance') {
  await screen.findByText(title);
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}

const example = () => screen.getByTestId('tax-example').textContent ?? '';
const value = (name: RegExp) => (screen.getByRole('textbox', { name }) as HTMLInputElement).value;

describe('Settings → Accounting — payroll tax rule (§10)', () => {
  beforeEach(() => {
    api.GET_ACCOUNTING_SETTINGS.mockImplementation(() => ok(SETTINGS));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the default slices, fund and insurance share, and a live example from the shared gross-up', async () => {
    renderSettings(<AccountingRulesSection />);
    await loaded();
    expect(value(/Slice 1: the next amount/)).toBe('5,000.00');
    expect(value(/Slice 6 rate/)).toBe('25');
    expect(screen.queryByRole('textbox', { name: /Slice 6: the next amount/ })).toBeNull(); // "The rest"
    expect(screen.getByText('The rest')).toBeTruthy();
    expect(value(/Martyrs' fund/)).toBe('0.05');
    expect(value(/Employee insurance share/)).toBe('11');
    // Net 10,000.00 → 1,017.00 tax, 5.51 fund, 11,022.51 gross (the same numbers as the API's tests).
    expect(example()).toContain("net 10,000.00 → income tax 1,017.00 · martyrs' fund 5.51 · gross 11,022.51");
  });

  it('a slice rate plus the fund reaching 100% shows the error, pauses the example and blocks saving', async () => {
    const user = userEvent.setup();
    renderSettings(<AccountingRulesSection />);
    await loaded();
    const rate = screen.getByRole('textbox', { name: /Slice 6 rate/ });
    await user.clear(rate);
    await user.type(rate, '99.99');
    expect(await screen.findByText("This rate plus the martyrs' fund must stay under 100%.")).toBeTruthy();
    expect(example()).toContain('Fix the tax rule above to see an example.');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('adding a slice puts it before "The rest"; saving sends the whole table (last open-ended) and only the keys that changed', async () => {
    const user = userEvent.setup();
    api.UPDATE_ACCOUNTING_SETTINGS.mockImplementation(() => ok(SETTINGS));
    renderSettings(<AccountingRulesSection />);
    await loaded();
    await user.click(screen.getByRole('button', { name: 'Add a slice' }));
    expect(value(/Slice 6: the next amount/)).toBe('1,000.00');
    const rate = screen.getByRole('textbox', { name: /Slice 6 rate/ });
    await user.clear(rate);
    await user.type(rate, '24');
    const fund = screen.getByRole('textbox', { name: /Martyrs' fund/ });
    await user.clear(fund);
    await user.type(fund, '0.1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.UPDATE_ACCOUNTING_SETTINGS).toHaveBeenCalledTimes(1));
    expect(api.UPDATE_ACCOUNTING_SETTINGS).toHaveBeenCalledWith({
      payroll: {
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
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('Arabic: an insurance share of 100% shows its message in Arabic', async () => {
    const user = userEvent.setup();
    renderSettings(<AccountingRulesSection />, 'ar');
    await loaded('الضرائب والتأمينات');
    const insurance = screen.getByRole('textbox', { name: /حصة العامل في التأمينات/ });
    await user.clear(insurance);
    await user.type(insurance, '100');
    expect(await screen.findByText('أدخل نسبة من 0 إلى 99.99، بحد أقصى رقمين عشريين.')).toBeTruthy();
  });

  it('without accounting.settings.edit there is no Save bar (view only)', async () => {
    const { TEST_SESSION } = await import('@/test/render');
    renderSettings(<AccountingRulesSection />, 'en', {
      ...TEST_SESSION,
      permissions: TEST_SESSION.permissions.filter((p) => p !== 'accounting.settings.edit'),
    });
    await loaded();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
