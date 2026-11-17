// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/render';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  afterEach(cleanup);

  it('requires a reason before confirming, and passes it on trimmed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    renderWithI18n(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Cancel penalty"
        confirmLabel="Cancel penalty"
        tone="destructive"
        requireReason
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Cancel penalty' });
    expect(confirm).toHaveProperty('disabled', true);

    await user.type(screen.getByRole('textbox', { name: /Reason/ }), '   ');
    expect(confirm).toHaveProperty('disabled', true);

    await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'Wrong employee ');
    expect(confirm).toHaveProperty('disabled', false);
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith('Wrong employee');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('cannot be confirmed twice while the action is running', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderWithI18n(
      <ConfirmDialog open onOpenChange={vi.fn()} title="Approve penalty" confirmLabel="Approve" onConfirm={onConfirm} />,
    );
    const confirm = screen.getByRole('button', { name: 'Approve' });
    await user.click(confirm);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveProperty('disabled', true);
    finish();
    await waitFor(() => expect(confirm.getAttribute('aria-busy')).toBeNull());
  });

  it('stays open when the action reports failure', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithI18n(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Approve" confirmLabel="Approve" onConfirm={() => false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
