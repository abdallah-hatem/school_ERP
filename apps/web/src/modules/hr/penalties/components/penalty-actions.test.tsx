// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const apis = vi.hoisted(() => ({
  APPROVE_PENALTY: vi.fn(),
  CANCEL_PENALTY: vi.fn(),
  REVIEW_APPROVE_PENALTY: vi.fn(),
  REJECT_PENALTY: vi.fn(),
}));
vi.mock('../apis', () => apis);

import { chooseRowAction, menuItemNames, openRowActions, rowActionsButton } from '@/test/row-actions';
import { sessionWithout } from '@/test/render';
import { failure, ok, record, renderPenalties } from '../test/fixtures';
import { PenaltyActions } from './penalty-actions';
import { ACTION, lvl } from '@/test/penalty-actions';

describe('PenaltyActions', () => {
  beforeEach(() => {
    router.refresh.mockReset();
    toast.error.mockReset();
    apis.APPROVE_PENALTY.mockReset();
    apis.CANCEL_PENALTY.mockReset();
    apis.REVIEW_APPROVE_PENALTY.mockReset();
    apis.REJECT_PENALTY.mockReset();
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
    expect(apis.APPROVE_PENALTY).toHaveBeenCalledWith('p-1', undefined, undefined, undefined);
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

  it('a penalty waiting for HR offers Approve, then Reject and Cancel (red, after a divider); approved only Cancel; cancelled nothing', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPenalties(<PenaltyActions record={record()} />);
    let menu = await openRowActions(user, 'Mona Khalil');
    expect(menuItemNames(menu)).toEqual(['Approve', 'Reject', 'Cancel']);
    expect(within(menu).getByRole('separator')).toBeTruthy();
    // Destructive items sit after the divider.
    const [approve, , cancel] = within(menu).getAllByRole('menuitem');
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
    const [approve, reject] = within(menu).getAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(approve));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(reject);
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
      expect(menuItemNames(menu)).toEqual(['Approve', 'Reject', 'Cancel']);
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

  describe('backdated penalty recount (§4, owner 2026-11-20)', () => {
    const RECOUNT = [
      {
        id: 'p-19',
        date: '2026-11-19',
        before: lvl(1, 'DEDUCT_DAYS', 0.5),
        after: lvl(2, 'DEDUCT_DAYS', 1),
      },
      {
        id: 'p-20',
        date: '2026-11-20',
        before: lvl(2, 'DEDUCT_DAYS', 1),
        after: lvl(3, 'DEDUCT_DAYS', 2),
      },
    ];
    const backdated = () => record({ date: '2026-11-18', level: 1, recount: RECOUNT });
    const ACK = [
      { id: 'p-19', level: 2, actionId: ACTION.DEDUCT_DAYS.id, days: 1, percent: null, amount: null },
      { id: 'p-20', level: 3, actionId: ACTION.DEDUCT_DAYS.id, days: 2, percent: null, amount: null },
    ];
    const items = (dialog: HTMLElement) =>
      within(within(dialog).getByTestId('penalty-recount'))
        .getAllByRole('listitem')
        .map((li) => li.textContent?.replace('•', '').trim());

    it('the confirmation lists the changes and its button says so; the request confirms exactly that list', async () => {
      const user = userEvent.setup();
      apis.APPROVE_PENALTY.mockResolvedValue(ok(record({ status: 'APPROVED' })));
      renderPenalties(<PenaltyActions record={backdated()} />);
      await chooseRowAction(user, 'Mona Khalil', 'Approve');
      const dialog = await screen.findByRole('dialog', { name: 'Approve this penalty?' });
      expect(dialog.textContent).toContain('Approving this will raise the level of 2 approved penalties:');
      expect(items(dialog)).toEqual([
        '19 Nov 2026: level 1 → 2, Deduct 0.5 day → Deduct 1 day',
        '20 Nov 2026: level 2 → 3, Deduct 1 day → Deduct 2 days',
      ]);
      expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull();
      await user.click(within(dialog).getByRole('button', { name: 'Approve and update 2 penalties' }));
      await waitFor(() => expect(router.refresh).toHaveBeenCalled());
      expect(apis.APPROVE_PENALTY).toHaveBeenCalledWith('p-1', ACK, undefined, undefined);
    });

    it('Arabic: the same list and button', async () => {
      const user = userEvent.setup();
      renderPenalties(<PenaltyActions record={backdated()} />, 'ar');
      await chooseRowAction(user, /^إجراءات منى خليل/, 'اعتماد');
      const dialog = await screen.findByRole('dialog', { name: 'اعتماد هذا الجزاء؟' });
      expect(dialog.textContent).toContain('اعتماد هذا الجزاء سيرفع مرة جزاءين معتمدين:');
      expect(items(dialog)).toEqual([
        '19 نوفمبر 2026: المرة 1 ← 2، خصم 0.5 يوم ← خصم يوم واحد',
        '20 نوفمبر 2026: المرة 2 ← 3، خصم يوم واحد ← خصم يومين',
      ]);
      expect(within(dialog).getByRole('button', { name: 'اعتماد وتحديث جزاءين' })).toBeTruthy();
    });

    it('the changes changed meanwhile (409 with the fresh list): the dialog shows it and confirms it next', async () => {
      const user = userEvent.setup();
      const fresh = [RECOUNT[0]!];
      apis.APPROVE_PENALTY.mockResolvedValueOnce({
        ...(failure(409, 'PENALTY_RECOUNT_CHANGED') as object),
        params: { count: 1 },
        data: { recount: fresh },
      } as never).mockResolvedValueOnce(ok(record({ status: 'APPROVED' })));
      renderPenalties(<PenaltyActions record={backdated()} />);
      await chooseRowAction(user, 'Mona Khalil', 'Approve');
      const dialog = await screen.findByRole('dialog', { name: 'Approve this penalty?' });
      await user.click(within(dialog).getByRole('button', { name: 'Approve and update 2 penalties' }));
      expect((await within(dialog).findByRole('alert')).textContent).toBe(
        'The list below is up to date now. Check it and confirm again.',
      );
      expect(items(dialog)).toEqual(['19 Nov 2026: level 1 → 2, Deduct 0.5 day → Deduct 1 day']);
      await user.click(within(dialog).getByRole('button', { name: 'Approve and update 1 penalty' }));
      await waitFor(() => expect(apis.APPROVE_PENALTY).toHaveBeenLastCalledWith('p-1', [ACK[0]], undefined, undefined));
    });

    it('L1 — penalties in stages the approver doesn’t see are only counted, and confirmed by their number', async () => {
      const user = userEvent.setup();
      apis.APPROVE_PENALTY.mockResolvedValue(ok(record({ status: 'APPROVED' })));
      renderPenalties(<PenaltyActions record={record({ recount: [RECOUNT[0]!], recountElsewhere: 2 })} />);
      await chooseRowAction(user, 'Mona Khalil', 'Approve');
      const dialog = await screen.findByRole('dialog', { name: 'Approve this penalty?' });
      expect(dialog.textContent).toContain('Approving this will raise the level of 3 approved penalties:');
      expect(items(dialog)).toEqual(['19 Nov 2026: level 1 → 2, Deduct 0.5 day → Deduct 1 day']);
      expect(within(dialog).getByTestId('penalty-recount-elsewhere').textContent).toBe(
        'And 2 approved penalties in other stages, which you don’t see.'.replace('’', "'"),
      );
      await user.click(within(dialog).getByRole('button', { name: 'Approve and update 3 penalties' }));
      await waitFor(() => expect(apis.APPROVE_PENALTY).toHaveBeenCalledWith('p-1', [ACK[0]], undefined, 2));
    });

    it('L-3 — a locked month among penalties of another stage blocks Approve without naming it', async () => {
      const user = userEvent.setup();
      renderPenalties(<PenaltyActions record={record({ recountElsewhere: 1, recountLockedElsewhere: true })} />);
      const menu = await openRowActions(user, 'Mona Khalil');
      const approve = within(menu).getByRole('menuitem', { name: /Approve/ });
      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(approve.textContent).toContain('an approved penalty, in another stage, in a month whose payroll is approved');
    });

    it('L1 — an earlier pending penalty in another stage blocks Approve without its date', async () => {
      const user = userEvent.setup();
      renderPenalties(<PenaltyActions record={record({ earlierPending: { id: null, date: null } })} />);
      const menu = await openRowActions(user, 'Mona Khalil');
      const approve = within(menu).getByRole('menuitem', { name: /Approve/ });
      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(approve.textContent).toContain('An earlier penalty for this violation, in another stage, is still waiting.');
    });

    it('one of them in an approved payroll month: Approve is disabled naming the month (EN + AR)', async () => {
      const user = userEvent.setup();
      const locked = () => record({ recount: RECOUNT, recountLockedMonth: '2026-10' });
      renderPenalties(<PenaltyActions record={locked()} />);
      const menu = await openRowActions(user, 'Mona Khalil');
      const approve = within(menu).getByRole('menuitem', { name: /Approve/ });
      expect(approve.getAttribute('aria-disabled')).toBe('true');
      expect(approve.textContent).toContain('an approved penalty in October 2026, whose payroll is approved');
      cleanup();
      renderPenalties(<PenaltyActions record={locked()} />, 'ar');
      const arMenu = await openRowActions(user, /^إجراءات منى خليل/);
      expect(within(arMenu).getByRole('menuitem', { name: /اعتماد/ }).textContent).toContain('أكتوبر 2026');
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

describe('PenaltyActions — the two steps (§4, owner 2026-11-21)', () => {
  beforeEach(() => {
    router.refresh.mockReset();
    apis.APPROVE_PENALTY.mockReset();
    apis.REVIEW_APPROVE_PENALTY.mockReset();
    apis.REJECT_PENALTY.mockReset();
  });
  afterEach(cleanup);

  it('Pending stage review: the stage head approves with an optional note (sent trimmed) — never HR’s Approve', async () => {
    const user = userEvent.setup();
    apis.REVIEW_APPROVE_PENALTY.mockResolvedValue(ok(record({ status: 'WAITING_HR' })));
    const session = sessionWithout('hr.penalties.approve', 'hr.penalties.cancel');
    renderPenalties(<PenaltyActions record={record({ status: 'PENDING_REVIEW' })} />, 'en', session);
    const menu = await openRowActions(user, 'Mona Khalil');
    expect(menuItemNames(menu)).toEqual(['Approve', 'Reject']);
    await user.keyboard('{Escape}');
    await chooseRowAction(user, 'Mona Khalil', 'Approve');
    const dialog = await screen.findByRole('dialog', { name: 'Approve at the stage review?' });
    await user.type(within(dialog).getByRole('textbox', { name: /Note/ }), '  checked  ');
    await user.click(within(dialog).getByRole('button', { name: 'Approve and send to HR' }));
    await waitFor(() => expect(apis.REVIEW_APPROVE_PENALTY).toHaveBeenCalledWith('p-1', 'checked'));
    expect(apis.APPROVE_PENALTY).not.toHaveBeenCalled();
  });

  it('reject needs a reason (blank refused); it goes to the step the user acts at', async () => {
    const user = userEvent.setup();
    apis.REJECT_PENALTY.mockResolvedValue(ok(record({ status: 'REJECTED' })));
    const session = sessionWithout('hr.penalties.approve');
    renderPenalties(<PenaltyActions record={record({ status: 'PENDING_REVIEW' })} />, 'ar', session);
    await chooseRowAction(user, /^إجراءات منى خليل/, 'رفض');
    const dialog = await screen.findByRole('dialog', { name: 'رفض هذا الجزاء؟' });
    const confirm = within(dialog).getByRole('button', { name: 'رفض الجزاء' });
    await user.type(within(dialog).getByRole('textbox', { name: /سبب الرفض/ }), '   ');
    expect(confirm).toHaveProperty('disabled', true);
    await user.type(within(dialog).getByRole('textbox', { name: /سبب الرفض/ }), 'كان في مهمة ');
    await user.click(confirm);
    await waitFor(() => expect(apis.REJECT_PENALTY).toHaveBeenCalledWith('p-1', 'كان في مهمة', 'review'));
  });

  it('Waiting for HR: HR rejects at the HR step', async () => {
    const user = userEvent.setup();
    apis.REJECT_PENALTY.mockResolvedValue(ok(record({ status: 'REJECTED' })));
    renderPenalties(<PenaltyActions record={record({ status: 'WAITING_HR' })} />, 'en', sessionWithout('hr.penalties.review'));
    await chooseRowAction(user, 'Mona Khalil', 'Reject');
    const dialog = await screen.findByRole('dialog', { name: 'Reject this penalty?' });
    await user.type(within(dialog).getByRole('textbox', { name: /Reason for rejecting/ }), 'No witness');
    await user.click(within(dialog).getByRole('button', { name: 'Reject penalty' }));
    await waitFor(() => expect(apis.REJECT_PENALTY).toHaveBeenCalledWith('p-1', 'No witness', 'hr'));
  });

  it('HR sees nothing to do on a penalty still waiting for its stage head — unless no head is left', async () => {
    const user = userEvent.setup();
    const hr = sessionWithout('hr.penalties.review', 'hr.penalties.cancel');
    const { unmount } = renderPenalties(<PenaltyActions record={record({ status: 'PENDING_REVIEW' })} />, 'en', hr);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    unmount();
    renderPenalties(<PenaltyActions record={record({ status: 'PENDING_REVIEW', hrMayDecide: true })} />, 'en', hr);
    const menu = await openRowActions(user, 'Mona Khalil');
    expect(menuItemNames(menu)).toEqual(['Approve', 'Reject']);
  });

  it('own penalty: no review or HR actions (only cancel, for whoever may cancel)', async () => {
    const user = userEvent.setup();
    renderPenalties(<PenaltyActions record={record({ status: 'WAITING_HR', ownPenalty: true })} />);
    const menu = await openRowActions(user, 'Mona Khalil');
    expect(menuItemNames(menu)).toEqual(['Cancel']);
  });

  it('a rejected penalty has no actions', () => {
    renderPenalties(<PenaltyActions record={record({ status: 'REJECTED' })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('someone acted first (409 PENALTY_WRONG_STEP): the dialog says so and the list refreshes on close', async () => {
    const user = userEvent.setup();
    apis.REVIEW_APPROVE_PENALTY.mockResolvedValue(failure(409, 'PENALTY_WRONG_STEP'));
    renderPenalties(<PenaltyActions record={record({ status: 'PENDING_REVIEW' })} />, 'en', sessionWithout('hr.penalties.approve'));
    await chooseRowAction(user, 'Mona Khalil', 'Approve');
    const dialog = await screen.findByRole('dialog', { name: 'Approve at the stage review?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve and send to HR' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('someone else acted on it first');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });
});
