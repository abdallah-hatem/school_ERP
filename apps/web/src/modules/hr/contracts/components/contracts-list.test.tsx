// @vitest-environment jsdom
import '@/test/dom-polyfills';
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
  UNDO_NOT_RENEW: vi.fn(),
  CANCEL_CONTRACT: vi.fn(),
  REQUEST_EARLY_TERMINATION: vi.fn(),
  APPROVE_EARLY_TERMINATION: vi.fn(),
  REJECT_EARLY_TERMINATION: vi.fn(),
  END_CONTRACT: vi.fn(),
  DEACTIVATE_CONTRACTS: vi.fn(),
  UPLOAD_CONTRACT_FILE: vi.fn(),
}));
vi.mock('../apis', () => api);
vi.mock('../../employees/apis', () => ({ GET_STAGES: vi.fn().mockResolvedValue({ success: true, status: 200, data: [] }) }));

import { PAGINATION, type Contract } from '@school-erp/shared';
import { sessionWithout } from '@/test/render';
import { menuItemNames, openRowActions } from '@/test/row-actions';
import type { ContractsListQuery } from '../lib/list-query';
import { calendar, contract, failure, ok, renderContracts, TODAY, totals } from '../test/fixtures';
import { ContractsList, type ContractsListProps } from './contracts-list';

const QUERY: ContractsListQuery = { year: 2026, page: 1, limit: PAGINATION.defaultLimit };

const undecided = contract();
const heba = contract({
  id: 'c-2',
  employee: { ...undecided.employee, id: 'e-heba', code: 'EMP-0019', nameEn: 'Heba Saeed', nameAr: 'هبة سعيد' },
});
const renewed = contract({
  id: 'c-3',
  status: 'RENEWED',
  decision: 'RENEWED',
  decidedBy: { id: 'u-1', name: 'Laila Hassan' },
  decidedAt: '2026-11-18T08:42:00.000Z',
  next: { id: 'c-3n', startsOn: '2027-06-01', endsOn: '2028-05-31' },
  employee: { ...undecided.employee, id: 'e-nour', code: 'EMP-0034', nameEn: 'Nourhan Adel', nameAr: 'نورهان عادل' },
});

function renderList(props: Partial<ContractsListProps> = {}, locale: 'en' | 'ar' = 'en', session?: Parameters<typeof renderContracts>[2]) {
  return renderContracts(
    <ContractsList
      basePath="/en/contracts"
      employeesPath="/en/employees"
      query={QUERY}
      currentYear={2026}
      today={TODAY}
      rows={[undecided, heba, renewed]}
      total={42}
      totals={totals}
      calendar={calendar}
      {...props}
    />,
    locale,
    session,
  );
}

const table = () => within(document.querySelector<HTMLElement>('[data-view="table"]')!);
const rowOf = (name: string) => table().getByText(name).closest('tr') as HTMLElement;

describe('ContractsList (renewals, option A)', () => {
  beforeEach(() => {
    router.push.mockReset();
    router.refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the page the server sent as it is — rows, the API total and the tiles — with no paging of its own', () => {
    renderList();
    expect(table().getAllByRole('row')).toHaveLength(1 + 3);
    expect(screen.getByTestId('contracts-count').textContent).toBe('42 contracts');
    // The tiles are the API's totals, not counts of the rows on screen.
    const tiles = screen.getByRole('region', { name: 'Contracts by decision' });
    expect(within(tiles).getByRole('button', { name: /Ending this year/ }).textContent).toContain('42');
    expect(within(tiles).getByRole('button', { name: /Not decided/ }).textContent).toContain('15');
    // "Ending this year" says which year: its dates.
    expect(within(tiles).getByRole('button', { name: /Ending this year/ }).textContent).toContain('1 Jun 2026 – 31 May 2027');
  });

  it('the tiles filter the list through the URL (pressed again: all), from the first page, without scrolling', async () => {
    const user = userEvent.setup();
    const { unmount } = renderList({ query: { ...QUERY, page: 3 } });
    await user.click(screen.getByRole('button', { name: /Not decided/ }));
    expect(router.push).toHaveBeenLastCalledWith('/en/contracts?decision=OPEN', { scroll: false });
    await user.click(screen.getByRole('button', { name: /To deactivate/ }));
    expect(router.push).toHaveBeenLastCalledWith('/en/contracts?decision=TO_DEACTIVATE', { scroll: false });
    unmount();

    renderList({ query: { ...QUERY, decision: 'OPEN' } });
    const open = screen.getByRole('button', { name: /Not decided/ });
    expect(open.getAttribute('aria-pressed')).toBe('true');
    await user.click(open);
    expect(router.push).toHaveBeenLastCalledWith('/en/contracts', { scroll: false });
  });

  it('the year stepper moves a contract year and keeps the filters', async () => {
    const user = userEvent.setup();
    renderList({ query: { ...QUERY, decision: 'DECIDED' } });
    expect(screen.getByRole('group', { name: 'Contract year' }).textContent).toContain('2026/27');
    expect(screen.getByRole('group', { name: 'Contract year' }).textContent).toContain('Ends 31 May 2027');
    await user.click(screen.getByRole('button', { name: 'Next year' }));
    expect(router.push).toHaveBeenLastCalledWith('/en/contracts?year=2027&decision=DECIDED', { scroll: false });
  });

  it('each row shows its one next step: Renew, Approve (Reject in the ⋯), Deactivate, the notice letter — none once renewed', async () => {
    const user = userEvent.setup();
    const early = contract({
      id: 'c-4',
      decision: 'EARLY_REQUESTED',
      earlyTermination: {
        status: 'REQUESTED',
        requestedOn: '2026-11-12',
        timing: 'ON_TIME',
        note: null,
        fileUrl: null,
        wouldEndOn: '2027-01-28',
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
      },
      employee: { ...undecided.employee, id: 'e-dina', nameEn: 'Dina Hassan', nameAr: 'دينا حسن' },
    });
    const ended = contract({
      id: 'c-5',
      status: 'NOT_RENEWED',
      decision: 'NOT_RENEWED_SCHOOL',
      nonRenewalBy: 'SCHOOL',
      startsOn: '2025-09-01',
      endsOn: '2026-08-31',
      toDeactivate: true,
      employee: { ...undecided.employee, id: 'e-yg', nameEn: 'Youssef Gamal', nameAr: 'يوسف جمال' },
    });
    const notice = contract({
      id: 'c-6',
      status: 'NOT_RENEWED',
      decision: 'NOTICE',
      nonRenewalBy: 'EMPLOYEE',
      notice: { receivedOn: '2026-11-10', timing: 'EARLY', fileUrl: '/files/contract-documents/c-6.pdf', note: null },
      employee: { ...undecided.employee, id: 'e-tm', nameEn: 'Tarek Mansour', nameAr: 'طارق منصور' },
    });
    renderList({ rows: [undecided, early, ended, notice, renewed] });

    expect(within(rowOf('Mona Khalil')).getByRole('button', { name: 'Renew' })).toBeTruthy();
    expect(within(rowOf('Dina Hassan')).getByRole('button', { name: 'Approve' })).toBeTruthy();
    // One line like the others: Reject is a destructive item of the ⋯.
    expect(within(rowOf('Dina Hassan')).queryByRole('button', { name: 'Reject' })).toBeNull();
    const menu = await openRowActions(user, 'Dina Hassan', within(rowOf('Dina Hassan')));
    expect(within(menu).getByRole('menuitem', { name: 'Reject request' }).getAttribute('data-destructive')).toBe('true');
    await user.keyboard('{Escape}');
    expect(within(rowOf('Dina Hassan')).queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(rowOf('Dina Hassan').textContent).toContain('Requested 12 Nov 2026 · would end 28 Jan 2027');
    expect(within(rowOf('Youssef Gamal')).getByRole('button', { name: 'Deactivate' })).toBeTruthy();
    expect(rowOf('Youssef Gamal').textContent).toContain('To deactivate');
    expect(within(rowOf('Tarek Mansour')).getByRole('link', { name: 'Letter' }).getAttribute('href')).toBe('/files/contract-documents/c-6.pdf');
    // The notice came in before term 2: tagged Early.
    expect(rowOf('Tarek Mansour').textContent).toContain('Early');
    const done = rowOf('Nourhan Adel');
    expect(within(done).queryByRole('button', { name: /Renew|Approve|Deactivate/ })).toBeNull();
    expect(done.textContent).toContain('Laila Hassan');
  });

  it('Renew asks first, then renews that one contract and refreshes the list', async () => {
    const user = userEvent.setup();
    api.RENEW_CONTRACTS.mockResolvedValue(ok([renewed]));
    renderList();
    await user.click(within(rowOf('Mona Khalil')).getByRole('button', { name: 'Renew' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renew this contract?' });
    expect(dialog.textContent).toContain('1 Jun 2027 to 31 May 2028');
    await user.click(within(dialog).getByRole('button', { name: 'Renew' }));
    await waitFor(() => expect(api.RENEW_CONTRACTS).toHaveBeenCalledWith(['c-1']));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('only renewable rows can be ticked; ticking shows the bulk bar with the new dates', async () => {
    const user = userEvent.setup();
    renderList();
    expect(screen.queryByTestId('bulk-bar')).toBeNull();
    expect(within(rowOf('Nourhan Adel')).getByRole('checkbox')).toHaveProperty('disabled', true);
    await user.click(table().getByRole('checkbox', { name: /Select every contract/ }));
    const bar = screen.getByTestId('bulk-bar');
    expect(bar.textContent).toContain('2 selected');
    expect(bar.textContent).toContain('Each gets 1 Jun 2027 – 31 May 2028');
    await user.click(within(bar).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByTestId('bulk-bar')).toBeNull();
  });

  it('a refused bulk renewal renews nothing and lists each refused row with its reason', async () => {
    const user = userEvent.setup();
    api.RENEW_CONTRACTS.mockResolvedValue(
      failure(409, 'CONTRACTS_NOT_RENEWABLE', { params: { count: 1 }, data: [{ contractId: 'c-2', code: 'EMPLOYEE_INACTIVE' }] }),
    );
    renderList();
    await user.click(within(rowOf('Mona Khalil')).getByRole('checkbox'));
    await user.click(within(rowOf('Heba Saeed')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Renew selected' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renew 2 contracts?' });
    await user.click(within(dialog).getByRole('button', { name: 'Renew 2 contracts' }));
    await waitFor(() => expect(api.RENEW_CONTRACTS).toHaveBeenCalledWith(['c-1', 'c-2']));
    expect(await within(dialog).findByText("Nothing was renewed: 1 of the selected contracts can't be renewed.")).toBeTruthy();
    expect(within(dialog).getByTestId('refused-rows').textContent).toBe('Heba Saeed: This employee is inactive.');
    // Still open: nothing was renewed.
    expect(screen.getByRole('dialog', { name: 'Renew 2 contracts?' })).toBeTruthy();
  });

  it('the viewer\'s own contract: no step, no tick box, the reason instead', () => {
    renderList({ rows: [contract({ ownContract: true })] });
    const row = rowOf('Mona Khalil');
    expect(within(row).queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(within(row).getByRole('checkbox')).toHaveProperty('disabled', true);
    expect(within(row).getByTestId('own-contract').textContent).toBe('Your own contract: someone else decides on it.');
  });

  it('without hr.contracts.manage: no tick boxes, no steps, no decisions (view only)', () => {
    renderList({}, 'en', sessionWithout('hr.contracts.manage'));
    expect(table().queryAllByRole('checkbox')).toHaveLength(0);
    expect(table().queryByRole('button', { name: 'Renew' })).toBeNull();
  });

  it('the calendar not set: the banner links to Settings → HR rules', () => {
    renderList({ calendar: null });
    const banner = screen.getByTestId('calendar-missing');
    expect(banner.textContent).toContain("The school calendar for 2026/27 isn't set");
    expect(within(banner).getByRole('link', { name: 'Set the calendar' }).getAttribute('href')).toBe('/en/settings?section=hrRules');
  });

  it('reads in Arabic: the decision pills and the count', () => {
    renderList({}, 'ar');
    expect(rowOf('منى خليل').textContent).toContain('بلا قرار');
    expect(screen.getByTestId('contracts-count').textContent).toBe('42 عقدًا');
  });

  it("review 10 — the school's note shows", () => {
    renderList({
      rows: [
        contract({
          status: 'NOT_RENEWED',
          decision: 'NOT_RENEWED_SCHOOL',
          nonRenewalBy: 'SCHOOL',
          note: 'Position closed next year',
          decidedBy: { id: 'u-1', name: 'Laila Hassan' },
          decidedAt: '2026-11-18T08:42:00.000Z',
        }),
      ],
    });
    expect(within(rowOf('Mona Khalil')).getByTestId('decision-note').textContent).toBe('Note: Position closed next year');
  });

  it('review 3 — undo not renewing', async () => {
    const user = userEvent.setup();
    api.UNDO_NOT_RENEW.mockResolvedValue(ok(contract()));
    const school = contract({ status: 'NOT_RENEWED', decision: 'NOT_RENEWED_SCHOOL', nonRenewalBy: 'SCHOOL' });
    const notice = contract({
      id: 'c-7',
      status: 'NOT_RENEWED',
      decision: 'NOTICE',
      nonRenewalBy: 'EMPLOYEE',
      notice: { receivedOn: '2026-11-10', timing: 'ON_TIME', fileUrl: null, note: null },
      employee: { ...undecided.employee, id: 'e-tm', nameEn: 'Tarek Mansour', nameAr: 'طارق منصور' },
    });
    renderList({ rows: [school, notice] });
    // An employee's notice is withdrawn instead; no undo there.
    const noticeMenu = await openRowActions(user, 'Tarek Mansour', within(rowOf('Tarek Mansour')));
    expect(menuItemNames(noticeMenu)).toContain('Withdraw the notice');
    expect(menuItemNames(noticeMenu)).not.toContain('Undo not renewing');
    await user.keyboard('{Escape}');

    const menu = await openRowActions(user, 'Mona Khalil', within(rowOf('Mona Khalil')));
    await user.click(within(menu).getByRole('menuitem', { name: 'Undo not renewing' }));
    const dialog = await screen.findByRole('dialog', { name: 'Undo not renewing?' });
    const confirm = within(dialog).getByRole('button', { name: 'Undo' });
    // The reason is required.
    expect(confirm).toHaveProperty('disabled', true);
    await user.type(within(dialog).getByRole('textbox'), 'Budget approved');
    await user.click(confirm);
    await waitFor(() => expect(api.UNDO_NOT_RENEW).toHaveBeenCalledWith('c-1', 'Budget approved'));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('carried-over row shows its year; the To deactivate tile says how many came from earlier years', () => {
    renderList({
      totals: { ...totals, carriedOver: 2 },
      rows: [
        contract({
          year: 2025,
          startsOn: '2025-06-01',
          endsOn: '2026-05-31',
          decision: 'ENDED_NO_DECISION',
          carriedOver: true,
        }),
      ],
    });
    expect(within(rowOf('Mona Khalil')).getByText('From 2025/26')).toBeTruthy();
    expect(rowOf('Mona Khalil').textContent).toContain('Ended, no decision');
    const tiles = screen.getByRole('region', { name: 'Contracts by decision' });
    expect(within(tiles).getByRole('button', { name: /To deactivate/ }).textContent).toContain('Incl. 2 still open from earlier years');
  });

  it('review 2 — end a renewed contract warns about the cancelled renewal', async () => {
    const user = userEvent.setup();
    api.END_CONTRACT.mockResolvedValue(ok(renewed));
    renderList({ rows: [renewed] });
    const menu = await openRowActions(user, 'Nourhan Adel', within(rowOf('Nourhan Adel')));
    await user.click(within(menu).getByRole('menuitem', { name: 'End for another reason…' }));
    const dialog = await screen.findByRole('dialog', { name: 'End the contract early' });
    expect(within(dialog).getByTestId('renewal-cancelled-warning').textContent).toBe(
      "The renewal (next year's contract) is cancelled too.",
    );
  });

  it('an empty year and an empty filter result say different things', () => {
    const { unmount } = renderList({ rows: [] as Contract[], total: 0 });
    expect(screen.getByText('No contracts end this year')).toBeTruthy();
    unmount();
    renderList({ rows: [], total: 0, query: { ...QUERY, search: 'zz' } });
    expect(screen.getByText('No contracts match')).toBeTruthy();
  });
});
