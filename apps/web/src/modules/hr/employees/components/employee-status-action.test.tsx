// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({ DEACTIVATE_EMPLOYEE: vi.fn(), REACTIVATE_EMPLOYEE: vi.fn() }));

import { DEACTIVATE_EMPLOYEE, REACTIVATE_EMPLOYEE } from '../apis';
import { employee, renderEmployees } from '../test/fixtures';
import { EmployeeStatusAction } from './employee-status-action';

const deactivate = vi.mocked(DEACTIVATE_EMPLOYEE);
const reactivate = vi.mocked(REACTIVATE_EMPLOYEE);

describe('EmployeeStatusAction', () => {
  beforeEach(() => {
    refresh.mockReset();
    deactivate.mockReset();
    reactivate.mockReset();
  });
  afterEach(cleanup);

  it('deactivates only after confirming, once, then refreshes the profile', async () => {
    const user = userEvent.setup();
    deactivate.mockResolvedValue({ success: true, status: 200, data: { ...employee, status: 'INACTIVE' } } as never);
    renderEmployees(<EmployeeStatusAction employee={employee} />);

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(deactivate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Mona Khalil?' });
    await user.dblClick(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledWith('e-mona');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the dialog open when the request fails', async () => {
    const user = userEvent.setup();
    reactivate.mockResolvedValue({ success: false, status: 500, message: 'Server error' } as never);
    renderEmployees(<EmployeeStatusAction employee={{ ...employee, status: 'INACTIVE' }} />, 'ar');

    await user.click(screen.getByRole('button', { name: 'إعادة تفعيل' }));
    const dialog = await screen.findByRole('dialog', { name: 'إعادة تفعيل منى خليل؟' });
    await user.click(within(dialog).getByRole('button', { name: 'إعادة تفعيل' }));

    await waitFor(() => expect(reactivate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
