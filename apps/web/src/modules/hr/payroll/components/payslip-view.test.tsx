// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

import { PAYSLIP, renderPayroll } from '../test/fixtures';
import { PAYSLIP_PRINT_CSS, PayslipUnavailable, PayslipView } from './payslip-view';

afterEach(cleanup);

function penaltyRows() {
  return screen.getAllByTestId('payslip-penalty');
}

describe('PayslipView', () => {
  it('payslip prints on one A4 page in both languages: A4 page rule, chrome hidden, every section present', () => {
    // jsdom can't paginate; the print contract is: an A4 @page, the app chrome and buttons marked
    // no-print, and the slip a single unbreakable block narrower than A4 — in EN and in AR.
    expect(PAYSLIP_PRINT_CSS).toMatch(/@page\s*{\s*size:\s*A4 portrait/);
    expect(PAYSLIP_PRINT_CSS).toContain('break-inside: avoid');
    for (const locale of ['en', 'ar'] as const) {
      const { unmount, container } = renderPayroll(<PayslipView payslip={PAYSLIP} backHref="/x" />, locale);
      expect(document.documentElement.dir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
      const slip = container.querySelector('[data-payslip]') as HTMLElement;
      expect(slip.className).toContain('max-w-[210mm]');
      // Print and back buttons are outside the slip and not printed.
      const toolbar = screen.getByRole('button', { name: locale === 'en' ? 'Print' : 'طباعة' }).closest('.no-print');
      expect(toolbar).toBeTruthy();
      expect(slip.contains(toolbar)).toBe(false);
      expect(container.querySelector('style')?.textContent).toBe(PAYSLIP_PRINT_CSS);
      expect(within(slip).getByText(locale === 'en' ? 'Salma Adel' : 'سلمى عادل')).toBeTruthy();
      expect(within(slip).getByText(locale === 'en' ? 'Demo School' : 'مدرسة تجريبية')).toBeTruthy();
      expect(within(slip).getByText(locale === 'en' ? 'November 2026' : 'نوفمبر 2026')).toBeTruthy();
      expect(penaltyRows()).toHaveLength(3);
      expect(screen.getAllByTestId('payslip-adjustment')).toHaveLength(2);
      unmount();
    }
  });

  it('lists every penalty, zero-amount ones too, each with its share and days', () => {
    renderPayroll(<PayslipView payslip={PAYSLIP} backHref="/x" />);
    const [warning, absent, early] = penaltyRows();
    expect(within(warning!).getByText('Warning')).toBeTruthy();
    expect(within(warning!).getByText('0.00')).toBeTruthy();
    expect(within(warning!).getByText('—')).toBeTruthy();
    expect(within(absent!).getByText('466.67')).toBeTruthy();
    expect(within(absent!).getByText('Level 2')).toBeTruthy();
    expect(within(early!).getByText('233.33')).toBeTruthy();
    expect(within(early!).getByText('0.5')).toBeTruthy();
    // The line total is what's deducted (shares can differ from it by a piastre).
    expect(screen.getByText('Penalty deductions').parentElement?.textContent).toContain('700.00');
  });

  it('shows lateness, adjustments with their reasons, and the net', () => {
    renderPayroll(<PayslipView payslip={PAYSLIP} backHref="/x" />);
    expect(screen.getByText('90 minutes = 0.75 day').parentElement?.textContent).toContain('350.00');
    expect(screen.getByText('Lost library book')).toBeTruthy();
    expect(screen.getByText('Exam supervision')).toBeTruthy();
    expect(screen.getByText('Net pay').parentElement?.textContent).toContain('13,350.00');
  });

  it('a payslip with nothing deducted says so', () => {
    renderPayroll(
      <PayslipView
        payslip={{
          ...PAYSLIP,
          penalties: [],
          adjustments: [],
          penaltyAmount: 0,
        }}
        backHref="/x"
      />,
    );
    expect(screen.getByText('No penalties this month.')).toBeTruthy();
    expect(screen.getByText('No adjustments this month.')).toBeTruthy();
  });

  it('a net floored at 0 is explained', () => {
    renderPayroll(<PayslipView payslip={{ ...PAYSLIP, net: 0, flags: ['NET_FLOORED'] }} backHref="/x" />);
    expect(screen.getByText('Deductions exceeded the salary, so net pay is 0.')).toBeTruthy();
  });

  it('Print opens the browser print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPayroll(<PayslipView payslip={PAYSLIP} backHref="/x" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('a draft run has no payslip: the server message and a way back', () => {
    renderPayroll(
      <PayslipUnavailable message="Available only after the payroll is approved." backHref="/en/payroll/r1" />,
    );
    expect(screen.getByText('No payslip yet')).toBeTruthy();
    expect(screen.getByText('Available only after the payroll is approved.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the run' }).getAttribute('href')).toBe('/en/payroll/r1');
  });
});

describe('PayslipView on a phone', () => {
  it.each(['en', 'ar'] as const)(
    '%s: every penalty also has a stacked entry (violation, level) for narrow screens; the printed table stays',
    (locale) => {
      renderPayroll(<PayslipView payslip={PAYSLIP} backHref="/x" />, locale);
      const stacked = screen.getAllByTestId('payslip-penalty-stacked');
      expect(stacked).toHaveLength(PAYSLIP.penalties.length);
      PAYSLIP.penalties.forEach((p, i) => {
        const entry = within(stacked[i] as HTMLElement);
        expect(entry.getByText(locale === 'ar' ? p.violationNameAr : p.violationNameEn)).toBeTruthy();
        expect(entry.getByText(locale === 'ar' ? `المرة ${p.level}` : `Level ${p.level}`)).toBeTruthy();
      });
      expect(penaltyRows()).toHaveLength(PAYSLIP.penalties.length);
    },
  );
});
