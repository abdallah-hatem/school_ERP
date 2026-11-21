// @vitest-environment jsdom
import type { AccountingPayrollHrBreakdown, AccountingPayrollMonthSheet } from '@school-erp/shared';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('../apis', () => ({
  GET_PAYROLL_TAXES_EXCEL: vi.fn(),
  RETURN_PAYROLL_MONTH: vi.fn(),
  FINALIZE_PAYROLL_MONTH: vi.fn(),
}));
vi.mock('@/shared/lib/download', () => ({ saveDownloadedFile: vi.fn() }));

import { MONTH, monthView, renderAccounting } from '../test/fixtures';
import { PayrollMonth } from './payroll-month';

/*
 * The Approved payroll month's skeleton traces its header (owner, 2026-11-21): title, the status
 * pill, the description, the buttons row of a pending month (Return to HR · Excel · Download PDF ·
 * Finalize), then the tiles and the card list — the same `data-skeleton-block`s in the same order
 * as the loaded header, which the skeleton spec (e2e/23-skeletons) then compares by size.
 */

afterEach(cleanup);

const HR: AccountingPayrollHrBreakdown = {
  departmentNameEn: 'Science',
  departmentNameAr: 'العلوم',
  monthSalary: 1_300_000,
  penaltyDays: 1,
  penaltyAmount: 50_000,
  latenessDays: 0.5,
  latenessAmount: 25_000,
  adjustmentAdditions: 0,
  adjustmentDeductions: 25_000,
};
const PENDING: AccountingPayrollMonthSheet = { ...MONTH, status: 'PENDING', lines: MONTH.lines.map((l) => ({ ...l, hr: HR })) };
const props = { monthKey: '2026-10' as const, basePath: '/en/accounting/payroll' };

/** The page's skeleton blocks, in document order. */
const blocks = () => [...document.querySelectorAll<HTMLElement>('[data-skeleton-block]')].map((el) => el.dataset.skeletonBlock);
/** The header's own blocks (breadcrumbs, status pill, buttons row). */
const headerBlocks = () => [...document.querySelectorAll<HTMLElement>('header[data-skeleton-block="header"] [data-skeleton-block]')].map((el) => el.dataset.skeletonBlock);
const actionsRow = () => document.querySelector<HTMLElement>('[data-skeleton-block="header-actions"]');
/** Each button's (or skeleton button's) text in the header's buttons row. */
const actionLabels = () => [...(actionsRow()?.querySelectorAll<HTMLElement>('button, [data-slot="skeleton"]') ?? [])].map((b) => b.textContent?.trim());

describe('PayrollMonth skeleton — header', () => {
  it('has the pill, the description and the four buttons of a pending month, in the loaded order', () => {
    renderAccounting(<PayrollMonth {...props} month={undefined} />);
    expect(headerBlocks()).toEqual(['header-breadcrumbs', 'header-status', 'header-actions']);
    const pill = document.querySelector('[data-skeleton-block="header-status"] [data-slot="skeleton"]');
    expect(pill?.textContent).toBe('Pending transfer');
    // Laid out for its width, never shown: transparent text on the pulsing bar.
    expect(pill?.className).toContain('text-transparent');
    expect(pill?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('header p')?.textContent).toBeTruthy();
    expect(actionLabels()).toEqual(['Return to HR', 'Excel', 'Download PDF', 'Finalize (transfer made)']);
    // Every one is the real button's box (md: h-11 px-4), not a fixed-width bar.
    for (const b of actionsRow()!.querySelectorAll<HTMLElement>('[data-slot="skeleton"]')) {
      expect(b.className).toContain('h-11');
      expect(b.className).toContain('px-4');
      expect(b.className).not.toMatch(/\bw-\d+/);
      expect(b.querySelector('svg')).not.toBeNull();
    }
    // Nothing in the header can be pressed while it loads.
    expect(actionsRow()!.querySelector('button')).toBeNull();
  });

  it('the same header blocks and button labels as the loaded pending month', () => {
    renderAccounting(<PayrollMonth {...props} month={undefined} />);
    const skeletonBlocks = headerBlocks();
    const skeletonLabels = actionLabels();
    const skeletonPage = blocks().filter((b) => b !== 'table-card');
    cleanup();
    renderAccounting(<PayrollMonth {...props} {...monthView(PENDING)} />);
    expect(headerBlocks()).toEqual(skeletonBlocks);
    expect(actionLabels()).toEqual(skeletonLabels);
    expect(document.querySelector('[data-skeleton-block="header-status"]')?.textContent).toBe('Pending transfer');
    // The whole page: header, the four tiles, then the card list's toolbar and pagination.
    expect(blocks().filter((b) => b !== 'table-card')).toEqual(skeletonPage);
    expect(skeletonPage).toEqual(['header', 'header-breadcrumbs', 'header-status', 'header-actions', 'tile', 'tile', 'tile', 'tile', 'table', 'table-toolbar', 'pagination']);
  });

  it('Arabic: the pill and the buttons in Arabic, so they are as wide as the loaded ones', () => {
    renderAccounting(<PayrollMonth {...props} month={undefined} />, 'ar');
    const skeletonLabels = actionLabels();
    expect(skeletonLabels).toHaveLength(4);
    // Return to HR, Download PDF and Finalize are Arabic words (Excel may stay "Excel").
    expect(skeletonLabels.filter((l) => l && /[؀-ۿ]/.test(l)).length).toBeGreaterThanOrEqual(3);
    cleanup();
    renderAccounting(<PayrollMonth {...props} {...monthView(PENDING)} />, 'ar');
    expect(actionLabels()).toEqual(skeletonLabels);
  });
});

describe('PayrollMonth — capped card list', () => {
  const cardList = () => document.querySelector<HTMLElement>('ul[data-view="cards"]')!;

  it('the cards scroll inside a box of about the screen height from md up; the pagination sits outside it', () => {
    for (const month of [undefined, PENDING]) {
      renderAccounting(<PayrollMonth {...props} {...(month ? monthView(month) : { month: undefined })} />);
      const list = cardList();
      expect(list.hasAttribute('data-scroll-capped')).toBe(true);
      expect(list.className).toContain('md:max-h-[max(26rem,calc(100dvh-14rem))]');
      expect(list.className).toContain('md:overflow-y-auto');
      // A phone flows with the page (no cap below md), and paper lists everyone.
      expect(list.className).not.toMatch(/(^|\s)max-h-/);
      expect(list.className).toContain('print:max-h-none');
      // Search above the box and pagination under it, both outside the scroll.
      const section = list.closest('section')!;
      expect(list.contains(section.querySelector('[data-skeleton-block="pagination"]'))).toBe(false);
      expect(list.contains(section.querySelector('[data-skeleton-block="table-toolbar"]'))).toBe(false);
      cleanup();
    }
  });
});
