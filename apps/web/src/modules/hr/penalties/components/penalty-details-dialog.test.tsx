// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const apis = vi.hoisted(() => ({ APPROVE_PENALTY: vi.fn(), CANCEL_PENALTY: vi.fn() }));
vi.mock('../apis', () => apis);

import { sessionWithout } from '@/test/render';
import { focusedPenaltyId } from '../lib/list-query';
import { ok, record, renderPenalties } from '../test/fixtures';
import { PenaltyDetailsDialog } from './penalty-details-dialog';

/* The penalty a notification's link opens (`?penalty=<id>`, §11, N2). */
describe('PenaltyDetailsDialog', () => {
  beforeEach(() => {
    router.refresh.mockReset();
    apis.APPROVE_PENALTY.mockReset();
  });
  afterEach(cleanup);

  it('shows the penalty — who, when, which violation, the level and action, the status', () => {
    renderPenalties(<PenaltyDetailsDialog record={record({ note: 'Came at 9' })} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Penalty' });
    const text = dialog.textContent ?? '';
    for (const part of ['Mona Khalil', 'Late arrival without notice', 'Level 2', 'Deduct 0.5 day', 'Pending', 'Came at 9']) {
      expect(text).toContain(part);
    }
  });

  it('approves from its own button, behind the confirmation, then refreshes', async () => {
    const user = userEvent.setup();
    apis.APPROVE_PENALTY.mockResolvedValue(ok(record({ status: 'APPROVED' })));
    renderPenalties(<PenaltyDetailsDialog record={record()} onClose={vi.fn()} />);
    await user.click(within(screen.getByRole('dialog', { name: 'Penalty' })).getByRole('button', { name: 'Approve' }));
    const confirm = await screen.findByRole('dialog', { name: 'Approve this penalty?' });
    await user.click(within(confirm).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(apis.APPROVE_PENALTY).toHaveBeenCalledWith('p-1');
  });

  it('an approved one has no Approve; without the permissions, no action at all', () => {
    renderPenalties(<PenaltyDetailsDialog record={record({ status: 'APPROVED' })} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Penalty' });
    expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    cleanup();

    renderPenalties(
      <PenaltyDetailsDialog record={record()} onClose={vi.fn()} />,
      'en',
      sessionWithout('hr.penalties.approve', 'hr.penalties.cancel'),
    );
    const viewOnly = screen.getByRole('dialog', { name: 'Penalty' });
    expect(within(viewOnly).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(viewOnly).queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('closing calls onClose (the screen drops ?penalty from the URL)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPenalties(<PenaltyDetailsDialog record={record()} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Penalty' });
    const [close] = within(dialog).getAllByRole('button', { name: 'Close' });
    await user.click(close!);
    expect(onClose).toHaveBeenCalled();
  });

  it('reads in Arabic', () => {
    renderPenalties(<PenaltyDetailsDialog record={record()} onClose={vi.fn()} />, 'ar');
    const dialog = screen.getByRole('dialog', { name: 'الجزاء' });
    expect(dialog.textContent).toContain('منى خليل');
    expect(dialog.textContent).toContain('التأخر دون إخطار');
  });

  it('nothing open without a record', () => {
    renderPenalties(<PenaltyDetailsDialog record={undefined} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('focusedPenaltyId', () => {
  it('takes a UUID from ?penalty, nothing else', () => {
    const id = '33333333-3333-4333-8333-333333333333';
    expect(focusedPenaltyId({ penalty: id })).toBe(id);
    expect(focusedPenaltyId({ penalty: [id, 'x'] })).toBe(id);
    expect(focusedPenaltyId({ penalty: 'nope' })).toBeUndefined();
    expect(focusedPenaltyId({})).toBeUndefined();
  });
});
