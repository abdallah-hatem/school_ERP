// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const apis = vi.hoisted(() => ({ APPROVE_PENALTY: vi.fn(), CANCEL_PENALTY: vi.fn() }));
vi.mock('../apis', () => apis);

import { chooseRowAction, menuItemNames, openRowActions, rowActionsButton } from '@/test/row-actions';
import { sessionWithout } from '@/test/render';
import { failure, ok, record, renderPenalties } from '../test/fixtures';
import { PenaltyActions } from './penalty-actions';

describe('PenaltyActions', () => {
  beforeEach(() => {
    router.refresh.mockReset();
    toast.error.mockReset();
    apis.APPROVE_PENALTY.mockReset();
    apis.CANCEL_PENALTY.mockReset();
  });
  afterEach(cleanup);

  it('approve asks for confirmation, then approves once and refreshes', async () => {
    const user = userEvent.setup();
    apis.APPROVE_PENALTY.mockResolvedValue(ok(record({ status: 'APPROVED' })));
    renderPenalties(<PenaltyActions record={record()} />);

    await chooseRowAction(user, 'Mona Khalil', 'Approve');
    expect(apis.APPROVE_PENALTY).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Approve this penalty?' });
    expect(dialog.textContent).toContain('Mona Khalil · Late arrival without notice · Deduct 0.5 day');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(apis.APPROVE_PENALTY).toHaveBeenCalledTimes(1);
    expect(apis.APPROVE_PENALTY).toHaveBeenCalledWith('p-1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closing the approve confirmation sends nothing', async () => {
    const user = userEvent.setup();
    renderPenalties(<PenaltyActions record={record()} />);
    await chooseRowAction(user, 'Mona Khalil', 'Approve');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(apis.APPROVE_PENALTY).not.toHaveBeenCalled();
  });

  it('Cancel requires a reason; the trimmed reason is sent', async () => {
    const user = userEvent.setup();
    apis.CANCEL_PENALTY.mockResolvedValue(ok(record({ status: 'CANCELLED', cancelReason: 'Wrong employee' })));
    renderPenalties(<PenaltyActions record={record()} />);

    await chooseRowAction(user, 'Mona Khalil', 'Cancel');
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this penalty?' });
    const confirm = within(dialog).getByRole('button', { name: 'Cancel penalty' });
    expect(confirm).toHaveProperty('disabled', true);
    await user.type(within(dialog).getByRole('textbox', { name: /Reason for cancelling/ }), '   ');
    expect(confirm).toHaveProperty('disabled', true);
    await user.click(confirm);
    expect(apis.CANCEL_PENALTY).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('textbox', { name: /Reason for cancelling/ }), 'Wrong employee ');
    expect(confirm).toHaveProperty('disabled', false);
    await user.click(confirm);
    await waitFor(() => expect(apis.CANCEL_PENALTY).toHaveBeenCalledWith('p-1', 'Wrong employee'));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('a pending penalty offers Approve then Cancel (red, after a divider); approved only Cancel; cancelled nothing', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPenalties(<PenaltyActions record={record()} />);
    let menu = await openRowActions(user, 'Mona Khalil');
    expect(menuItemNames(menu)).toEqual(['Approve', 'Cancel']);
    expect(within(menu).getByRole('separator')).toBeTruthy();
    // Destructive items sit after the divider.
    const [approve, cancel] = within(menu).getAllByRole('menuitem');
    expect(within(menu).getByRole('separator').compareDocumentPosition(cancel!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(approve!.compareDocumentPosition(within(menu).getByRole('separator')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.keyboard('{Escape}');
    unmount();

    const approved = renderPenalties(<PenaltyActions record={record({ status: 'APPROVED' })} />);
    menu = await openRowActions(user, 'Mona Khalil');
    expect(menuItemNames(menu)).toEqual(['Cancel']);
    expect(within(menu).queryByRole('separator')).toBeNull();
    await user.keyboard('{Escape}');
    approved.unmount();

    renderPenalties(<PenaltyActions record={record({ status: 'CANCELLED' })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('the menu works from the keyboard: Enter opens, arrows move, Escape closes back on the ⋯', async () => {
    const user = userEvent.setup();
    renderPenalties(<PenaltyActions record={record()} />);
    const trigger = rowActionsButton('Mona Khalil');
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    const [approve, cancel] = within(menu).getAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(approve));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cancel);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);

    // Space opens too; Enter on an item runs it.
    await user.keyboard(' ');
    await screen.findByRole('menu');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Approve this penalty?' })).toBeTruthy();
  });

  it('PAYROLL_APPROVED error shown as a clear message (Arabic), and the list refreshes on close', async () => {
    const user = userEvent.setup();
    apis.APPROVE_PENALTY.mockResolvedValue(failure(409, 'PAYROLL_APPROVED'));
    renderPenalties(<PenaltyActions record={record()} />, 'ar');

    await chooseRowAction(user, /^إجراءات منى خليل/, 'اعتماد');
    const dialog = await screen.findByRole('dialog', { name: 'اعتماد هذا الجزاء؟' });
    await user.click(within(dialog).getByRole('button', { name: 'اعتماد' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe('رواتب هذا الشهر معتمدة ومقفلة.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  describe('approve in date order (§4, owner 2026-11-20)', () => {
    const waiting = () => record({ earlierPending: { id: 'p-0', date: '2026-11-04' } });

    it('waiting for an earlier pending one: Approve is shown disabled with the reason; Cancel still works', async () => {
      const user = userEvent.setup();
      renderPenalties(<PenaltyActions record={waiting()} />);
      const menu = await openRowActions(user, 'Mona Khalil');
      expect(menuItemNames(menu)).toEqual(['Approve', 'Cancel']);
      const approve = within(menu).getByRole('menuitem', { name: /Approve/ });
      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(approve.textContent).toContain('Approve or cancel the 4 Nov 2026 penalty for this violation first.');
      await user.click(approve);
      expect(screen.queryByRole('dialog', { name: 'Approve this penalty?' })).toBeNull();
      expect(apis.APPROVE_PENALTY).not.toHaveBeenCalled();

      await user.click(within(menu).getByRole('menuitem', { name: 'Cancel' }));
      expect(await screen.findByRole('dialog', { name: 'Cancel this penalty?' })).toBeTruthy();
    });

    it('Arabic: the reason names the date in Arabic', async () => {
      const user = userEvent.setup();
      renderPenalties(<PenaltyActions record={waiting()} />, 'ar');
      const menu = await openRowActions(user, /^إجراءات منى خليل/);
      const approve = within(menu).getByRole('menuitem', { name: /اعتماد/ });
      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(approve.textContent).toContain('اعتمد أو ألغِ جزاء يوم');
      expect(approve.textContent).toContain('نوفمبر');
    });

    it('buttons (the penalty a notification opens): Approve disabled, described by the reason', () => {
      renderPenalties(
        <>
          <p id="penalty-p-1-blocked">reason</p>
          <PenaltyActions record={waiting()} variant="buttons" />
        </>,
      );
      const approve = screen.getByRole('button', { name: 'Approve' });
      expect(approve).toHaveProperty('disabled', true);
      expect(approve.getAttribute('aria-describedby')).toBe('penalty-p-1-blocked');
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', false);
    });

    it('nothing waiting, or not pending: Approve is enabled as before', async () => {
      const user = userEvent.setup();
      renderPenalties(<PenaltyActions record={record({ earlierPending: null })} />);
      const menu = await openRowActions(user, 'Mona Khalil');
      expect(within(menu).getByRole('menuitem', { name: 'Approve' }).getAttribute('aria-disabled')).toBeNull();
    });

    it('the list was out of date: the server refusal names the date in the dialog', async () => {
      const user = userEvent.setup();
      apis.APPROVE_PENALTY.mockResolvedValue({
        ...(failure(409, 'PENALTY_EARLIER_PENDING') as object),
        params: { date: '2026-11-04' },
      } as never);
      renderPenalties(<PenaltyActions record={record()} />);
      await chooseRowAction(user, 'Mona Khalil', 'Approve');
      const dialog = await screen.findByRole('dialog', { name: 'Approve this penalty?' });
      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
      expect((await within(dialog).findByRole('alert')).textContent).toBe(
        'Approve or cancel the 4 Nov 2026 penalty for this violation first.',
      );
    });
  });

  it('PENALTY_CANCELLED on cancel is explained in the dialog', async () => {
    const user = userEvent.setup();
    apis.CANCEL_PENALTY.mockResolvedValue(failure(409, 'PENALTY_CANCELLED'));
    renderPenalties(<PenaltyActions record={record({ status: 'APPROVED' })} />);

    await chooseRowAction(user, 'Mona Khalil', 'Cancel');
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /Reason for cancelling/ }), 'Duplicate');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel penalty' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('This penalty is already cancelled.');
  });

  it('edge case 9 — a user who can record but not approve sees no Approve; with neither key, no menu', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPenalties(<PenaltyActions record={record()} />, 'en', sessionWithout('hr.penalties.approve'));
    const menu = await openRowActions(user, 'Mona Khalil');
    expect(menuItemNames(menu)).toEqual(['Cancel']);
    await user.keyboard('{Escape}');
    unmount();

    renderPenalties(<PenaltyActions record={record()} />, 'en', sessionWithout('hr.penalties.approve', 'hr.penalties.cancel'));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
