// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { menuItemNames, openRowActions } from '@/test/row-actions';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; scroll?: boolean; prefetch?: boolean }) => {
    const anchor = { ...props };
    delete anchor.scroll;
    delete anchor.prefetch;
    return <a {...anchor} />;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({
  RENEW_CONTRACTS: vi.fn(),
  NOT_RENEW_CONTRACT: vi.fn(),
  WITHDRAW_NOTICE: vi.fn(),
  REQUEST_EARLY_TERMINATION: vi.fn(),
  APPROVE_EARLY_TERMINATION: vi.fn(),
  REJECT_EARLY_TERMINATION: vi.fn(),
  END_CONTRACT: vi.fn(),
  DEACTIVATE_CONTRACTS: vi.fn(),
  UPLOAD_CONTRACT_FILE: vi.fn(),
  GET_SCHOOL_CALENDAR: vi.fn().mockResolvedValue({ success: true, status: 200, data: { year: 2026, calendar: null } }),
}));

import { sessionWithout } from '@/test/render';
import { contract, renderContracts, TODAY } from '../test/fixtures';
import { EmployeeContracts, type EmployeeContractsProps } from './employee-contracts';

const employee = { id: 'e-mona', nameEn: 'Mona Khalil', nameAr: 'منى خليل', contractStart: '2026-06-01' };

const current = contract();
const previous = contract({
  id: 'c-0',
  year: 2025,
  startsOn: '2025-06-01',
  endsOn: '2026-05-31',
  status: 'RENEWED',
  decision: 'RENEWED',
  decidedBy: { id: 'u-1', name: 'Laila Hassan' },
  decidedAt: '2026-03-02T08:00:00.000Z',
  next: { id: 'c-1', startsOn: '2026-06-01', endsOn: '2027-05-31' },
  notice: null,
  earlyTermination: {
    status: 'REJECTED',
    requestedOn: '2025-10-01',
    timing: 'ON_TIME',
    note: null,
    fileUrl: '/files/contract-documents/request.pdf',
    wouldEndOn: '2026-01-29',
    decidedBy: { id: 'u-1', name: 'Laila Hassan' },
    decidedAt: '2025-10-03T08:00:00.000Z',
    rejectReason: 'Exams season',
  },
});

function renderTab(props: Partial<EmployeeContractsProps> = {}, session?: Parameters<typeof renderContracts>[2]) {
  return renderContracts(
    <EmployeeContracts
      employeeId="e-mona"
      employee={employee}
      basePath="/en/employees/e-mona/contracts"
      rows={[current, previous]}
      total={12}
      page={1}
      limit={10}
      today={TODAY}
      {...props}
    />,
    'en',
    session,
  );
}

const table = () => within(document.querySelector<HTMLElement>('[data-view="table"]')!);

describe('EmployeeContracts (profile tab)', () => {
  beforeEach(() => router.push.mockReset());
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists the history as the API sent it: year, dates, decision, who decided, the early termination and its document', () => {
    renderTab();
    const rows = table().getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]?.textContent).toContain('2026/27');
    expect(rows[1]?.textContent).toContain('Current');
    expect(rows[1]?.textContent).toContain('Not decided');
    expect(rows[2]?.textContent).toContain('2025/26');
    expect(rows[2]?.textContent).toContain('1 Jun 2025 – 31 May 2026');
    expect(rows[2]?.textContent).toContain('Renewed');
    expect(rows[2]?.textContent).toContain('Laila Hassan');
    expect(rows[2]?.textContent).toContain('Early termination requested 1 Oct 2025 · Rejected');
    expect(rows[2]?.textContent).toContain('Rejected: Exams season');
    expect(rows[2]?.textContent).toContain('Next: 1 Jun 2026 – 31 May 2027');
    expect(within(rows[2] as HTMLElement).getByRole('link', { name: 'Request' }).getAttribute('href')).toBe(
      '/files/contract-documents/request.pdf',
    );
  });

  it('the decisions sit on the current contract only, for whoever may manage contracts', async () => {
    const user = userEvent.setup();
    renderTab();
    const [, currentRow, previousRow] = table().getAllByRole('row') as HTMLElement[];
    expect(within(currentRow!).getByRole('button', { name: 'Renew' })).toBeTruthy();
    expect(within(currentRow!).getByRole('button', { name: 'Decide' })).toBeTruthy();
    expect(within(previousRow!).queryByRole('button')).toBeNull();
    // No "Contract history" here: this is the history.
    const menu = await openRowActions(user, 'Mona Khalil', within(currentRow!));
    expect(menuItemNames(menu)).toEqual([
      "Not renewing — school's decision",
      "Record the employee's notice",
      'Record an early termination request',
      'End for another reason…',
    ]);
  });

  it('view only without hr.contracts.manage', () => {
    renderTab({}, sessionWithout('hr.contracts.manage'));
    expect(table().queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(table().queryByRole('button', { name: 'Decide' })).toBeNull();
  });

  it('pages through the API (the URL), without scrolling', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /Next page/ }));
    expect(router.push).toHaveBeenLastCalledWith('/en/employees/e-mona/contracts?page=2', { scroll: false });
  });

  it('no contracts yet: says so', () => {
    renderTab({ rows: [], total: 0 });
    expect(screen.getByText('No contracts yet')).toBeTruthy();
  });
});
