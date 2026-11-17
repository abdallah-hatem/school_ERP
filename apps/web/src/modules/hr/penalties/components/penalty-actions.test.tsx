// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const apis = vi.hoisted(() => ({ APPROVE_PENALTY: vi.fn(), CANCEL_PENALTY: vi.fn() }));
vi.mock('../apis', () => apis);

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

    await user.click(screen.getByRole('button', { name: 'Approve the penalty of Mona Khalil' }));
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
    await user.click(screen.getByRole('button', { name: 'Approve the penalty of Mona Khalil' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(apis.APPROVE_PENALTY).not.toHaveBeenCalled();
  });

  it('Cancel requires a reason; the trimmed reason is sent', async () => {
    const user = userEvent.setup();
    apis.CANCEL_PENALTY.mockResolvedValue(ok(record({ status: 'CANCELLED', cancelReason: 'Wrong employee' })));
    renderPenalties(<PenaltyActions record={record()} />);

    await user.click(screen.getByRole('button', { name: 'Cancel the penalty of Mona Khalil' }));
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

  it('an approved penalty can only be cancelled; a cancelled one has no actions', () => {
    const { unmount } = renderPenalties(<PenaltyActions record={record({ status: 'APPROVED' })} />);
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel the penalty of Mona Khalil' })).toBeTruthy();
    unmount();
    renderPenalties(<PenaltyActions record={record({ status: 'CANCELLED' })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('PAYROLL_APPROVED error shown as a clear message (Arabic), and the list refreshes on close', async () => {
    const user = userEvent.setup();
    apis.APPROVE_PENALTY.mockResolvedValue(failure(409, 'PAYROLL_APPROVED'));
    renderPenalties(<PenaltyActions record={record()} />, 'ar');

    await user.click(screen.getByRole('button', { name: 'اعتماد جزاء منى خليل' }));
    const dialog = await screen.findByRole('dialog', { name: 'اعتماد هذا الجزاء؟' });
    await user.click(within(dialog).getByRole('button', { name: 'اعتماد' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe('رواتب هذا الشهر معتمدة ومقفلة.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it('PENALTY_CANCELLED on cancel is explained in the dialog', async () => {
    const user = userEvent.setup();
    apis.CANCEL_PENALTY.mockResolvedValue(failure(409, 'PENALTY_CANCELLED'));
    renderPenalties(<PenaltyActions record={record({ status: 'APPROVED' })} />);

    await user.click(screen.getByRole('button', { name: 'Cancel the penalty of Mona Khalil' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /Reason for cancelling/ }), 'Duplicate');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel penalty' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('This penalty is already cancelled.');
  });
});
