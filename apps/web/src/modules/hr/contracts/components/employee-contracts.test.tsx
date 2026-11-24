// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { menuItemNames, openRowActions } from '@/test/row-actions';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
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
const api = vi.hoisted(() => ({
  RENEW_CONTRACTS: vi.fn(),
  NOT_RENEW_CONTRACT: vi.fn(),
  WITHDRAW_NOTICE: vi.fn(),
  REQUEST_EARLY_TERMINATION: vi.fn(),
  APPROVE_EARLY_TERMINATION: vi.fn(),
  REJECT_EARLY_TERMINATION: vi.fn(),
  END_CONTRACT: vi.fn(),
  DEACTIVATE_CONTRACTS: vi.fn(),
  UPLOAD_CONTRACT_FILE: vi.fn(),
  UNDO_NOT_RENEW: vi.fn(),
  CREATE_EMPLOYEE_CONTRACT: vi.fn(),
  CANCEL_CONTRACT: vi.fn(),
}));
vi.mock('../apis', () => api);

import { sessionWithout } from '@/test/render';
import { contract, ok, renderContracts, TODAY } from '../test/fixtures';
import { EmployeeContracts, type EmployeeContractsProps } from './employee-contracts';

const employee = { id: 'e-mona', nameEn: 'Mona Khalil', nameAr: 'منى خليل', status: 'ACTIVE' as const };

const current = contract();
const previous = contract({
  id: 'c-0',
  year: 2025,
  startsOn: '2025-06-01',
  endsOn: '2026-05-31',
  status: 'RENEWED',
  phase: 'PAST',
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

  it('the decisions sit on the current contract only, for whoever may manage contracts; every row takes a signed copy', async () => {
    const user = userEvent.setup();
    renderTab();
    const [, currentRow, previousRow] = table().getAllByRole('row') as HTMLElement[];
    expect(within(currentRow!).getByRole('button', { name: 'Renew' })).toBeTruthy();
    expect(within(currentRow!).getByRole('button', { name: 'Decide' })).toBeTruthy();
    expect(within(previousRow!).queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(within(previousRow!).queryByRole('button', { name: 'Decide' })).toBeNull();
    // No "Contract history" here: this is the history.
    const menu = await openRowActions(user, 'Mona Khalil', within(currentRow!));
    expect(menuItemNames(menu)).toEqual([
      "Not renewing — school's decision",
      "Record the employee's notice",
      'Record an early termination request',
      'Upload signed copy',
      'End for another reason…',
    ]);
    await user.keyboard('{Escape}');
    // Owner 2026-11-24: an old contract is scanned too — its ⋯ holds only the signed copy.
    const oldMenu = await openRowActions(user, 'Mona Khalil', within(previousRow!));
    expect(menuItemNames(oldMenu)).toEqual(['Upload signed copy']);
  });

  it('view only without hr.contracts.manage', () => {
    renderTab({}, sessionWithout('hr.contracts.manage'));
    expect(table().queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(table().queryByRole('button', { name: 'Decide' })).toBeNull();
    expect(table().queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });

  it('pages through the API (the URL), without scrolling', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /Next page/ }));
    expect(router.push).toHaveBeenLastCalledWith('/en/employees/e-mona/contracts?page=2', { scroll: false });
  });

  it('review 3 — new contract button only without an active contract', async () => {
    const user = userEvent.setup();
    // The current contract is active: no new one.
    const { unmount } = renderTab();
    expect(screen.queryByRole('button', { name: 'New contract' })).toBeNull();
    unmount();
    // Not renewed by the school, and ended: a new contract can be made.
    const ended = contract({ status: 'NOT_RENEWED', phase: 'PAST', decision: 'NOT_RENEWED_SCHOOL', nonRenewalBy: 'SCHOOL', startsOn: '2025-06-01', endsOn: '2026-05-31', year: 2025 });
    api.CREATE_EMPLOYEE_CONTRACT.mockResolvedValue(ok(contract()));
    const { unmount: unmount2 } = renderTab({ rows: [ended], total: 1 });
    await user.click(screen.getByRole('button', { name: 'New contract' }));
    const dialog = await screen.findByRole('dialog', { name: 'New contract' });
    // The default start (1 June of this contract year) and its end, one year later.
    expect(dialog.textContent).toContain('1 Jun 2026');
    expect(within(dialog).getByTestId('new-contract-end').textContent).toBe('It ends one year later: 31 May 2027.');
    await user.click(within(dialog).getByRole('button', { name: 'Create contract' }));
    await waitFor(() => expect(api.CREATE_EMPLOYEE_CONTRACT).toHaveBeenCalledWith('e-mona', {}));
    expect(router.refresh).toHaveBeenCalled();
    unmount2();
    // Not for an inactive employee, nor without hr.contracts.manage; with no contract at all, it is the empty state's action.
    const { unmount: unmount3 } = renderTab({ rows: [ended], employee: { ...employee, status: 'INACTIVE' } });
    expect(screen.queryByRole('button', { name: 'New contract' })).toBeNull();
    unmount3();
    const { unmount: unmount4 } = renderTab({ rows: [ended] }, sessionWithout('hr.contracts.manage'));
    expect(screen.queryByRole('button', { name: 'New contract' })).toBeNull();
    unmount4();
    renderTab({ rows: [], total: 0 });
    expect(screen.getByText('No contracts yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New contract' })).toBeTruthy();
  });

  it("review 10 — the school's note shows in the history", () => {
    renderTab({
      rows: [contract({ status: 'NOT_RENEWED', decision: 'NOT_RENEWED_SCHOOL', nonRenewalBy: 'SCHOOL', note: 'Position closed' })],
    });
    expect(table().getByTestId('decision-note').textContent).toBe('Note: Position closed');
  });

  it('a cancelled renewal reads as its own pill', () => {
    renderTab({
      rows: [contract({ id: 'c-9', status: 'CANCELLED', phase: 'PAST', decision: 'CANCELLED', year: 2027, startsOn: '2027-06-01', endsOn: '2028-05-31' })],
    });
    const row = table().getAllByRole('row')[1]!;
    expect(row.textContent).toContain('Cancelled');
    expect(row.textContent).not.toContain('Upcoming');
    expect(row.textContent).not.toContain('Current');
    expect(within(row as HTMLElement).queryByRole('button')).toBeNull();
  });

  /*
   * Bug 2026-11-24 (owner, testing): 2026/27 renewed in November into 2027/28. The tab marked 2027/28
   * "Current" with Renew and Decide on it. Now "Current" is the API's phase, and actions follow it.
   */
  describe('after a November renewal (bug 2026-11-24)', () => {
    const inForce = contract({
      id: 'c-1',
      status: 'RENEWED',
      phase: 'CURRENT',
      decision: 'RENEWED',
      next: { id: 'c-2', startsOn: '2027-06-01', endsOn: '2028-05-31' },
    });
    const upcoming = contract({ id: 'c-2', year: 2027, startsOn: '2027-06-01', endsOn: '2028-05-31', phase: 'UPCOMING', renewalOf: 'c-1' });

    it('2026/27 is "Current"; 2027/28 is "Upcoming · starts 1 Jun 2027" with no Renew, no Decide — only its signed copy', async () => {
      const user = userEvent.setup();
      renderTab({ rows: [upcoming, inForce], total: 2 });
      const [, upcomingRow, currentRow] = table().getAllByRole('row') as HTMLElement[];
      expect(upcomingRow!.textContent).toContain('2027/28');
      expect(upcomingRow!.textContent).toContain('Upcoming · starts 1 Jun 2027');
      expect(upcomingRow!.textContent).not.toContain('Current');
      expect(within(upcomingRow!).queryByRole('button', { name: 'Renew' })).toBeNull();
      expect(within(upcomingRow!).queryByRole('button', { name: 'Decide' })).toBeNull();
      expect(menuItemNames(await openRowActions(user, 'Mona Khalil', within(upcomingRow!)))).toEqual(['Upload signed copy']);
      expect(currentRow!.textContent).toContain('2026/27');
      expect(currentRow!.textContent).toContain('Current');
    });

    it('the in-force renewed contract keeps its actions: End for another reason (a May dismissal), no Renew', async () => {
      const user = userEvent.setup();
      renderTab({ rows: [upcoming, inForce], total: 2 });
      const [, , currentRow] = table().getAllByRole('row') as HTMLElement[];
      expect(within(currentRow!).queryByRole('button', { name: 'Renew' })).toBeNull();
      const menu = await openRowActions(user, 'Mona Khalil', within(currentRow!));
      expect(menuItemNames(menu)).toEqual(['Upload signed copy', 'End for another reason…']);
    });

    it('from 1 June the API sends 2027/28 as CURRENT: it gets Renew and Decide', () => {
      renderTab({
        rows: [{ ...upcoming, phase: 'CURRENT' }, { ...inForce, phase: 'PAST' }],
        total: 2,
        today: '2027-06-01',
      });
      const [, nowCurrent, past] = table().getAllByRole('row') as HTMLElement[];
      expect(nowCurrent!.textContent).toContain('Current');
      expect(within(nowCurrent!).getByRole('button', { name: 'Renew' })).toBeTruthy();
      expect(within(past!).queryByRole('button', { name: 'Renew' })).toBeNull();
      expect(within(past!).queryByRole('button', { name: 'Decide' })).toBeNull();
    });
  });

  it('review 2026-11-24 — a new contract with a future start (not a renewal) offers "Cancel contract" (with a reason) besides its signed copy', async () => {
    const user = userEvent.setup();
    const fresh = contract({ id: 'c-5', year: 2027, startsOn: '2027-06-01', endsOn: '2028-05-31', phase: 'UPCOMING' });
    api.CANCEL_CONTRACT.mockResolvedValue(ok({ ...fresh, status: 'CANCELLED', phase: 'PAST', decision: 'CANCELLED' }));
    renderTab({ rows: [fresh], total: 1 });
    const row = table().getAllByRole('row')[1] as HTMLElement;
    expect(within(row).queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Decide' })).toBeNull();
    const menu = await openRowActions(user, 'Mona Khalil', within(row));
    expect(menuItemNames(menu)).toEqual(['Upload signed copy', 'Cancel contract']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Cancel contract' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this contract?' });
    await user.type(within(dialog).getByRole('textbox'), 'Never joined');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel contract' }));
    await waitFor(() => expect(api.CANCEL_CONTRACT).toHaveBeenCalledWith('c-5', 'Never joined'));
  });

  it('review 2026-11-24 — a 1 Sep – 31 Aug contract reads the year it starts in (2026/27), not the season it ends in', () => {
    renderTab({ rows: [contract({ year: 2027, startsOn: '2026-09-01', endsOn: '2027-08-31' })], total: 1 });
    const row = table().getAllByRole('row')[1]!;
    expect(row.textContent).toContain('2026/27');
    expect(row.textContent).not.toContain('2027/28');
  });

  it('no contracts yet: says so', () => {
    renderTab({ rows: [], total: 0 });
    expect(screen.getByText('No contracts yet')).toBeTruthy();
  });
});
