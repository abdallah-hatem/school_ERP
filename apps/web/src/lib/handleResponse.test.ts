// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { callApi } from './callApi';
import { handleResponse } from './handleResponse';

describe('handleResponse (client)', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  it('shows the server message on failure', async () => {
    await handleResponse({
      response: { success: false, status: 409, message: 'Payroll is approved', error: 'PAYROLL_APPROVED' },
    });
    expect(toast.error).toHaveBeenCalledWith('Payroll is approved');
  });

  it('stays quiet on success unless asked', async () => {
    await handleResponse({ response: { success: true, status: 200, message: 'Saved' } });
    expect(toast.success).not.toHaveBeenCalled();
    await handleResponse({
      response: { success: true, status: 200, message: 'Saved' },
      showSuccessToast: true,
    });
    expect(toast.success).toHaveBeenCalledWith('Saved');
  });

  it('uses the caller\'s translated success text over the generic envelope message', async () => {
    await callApi(Promise.resolve({ success: true as const, status: 200, message: 'Resource updated successfully' }), {
      showSuccessToast: true,
      successMessage: 'Lateness saved',
    });
    expect(toast.success).toHaveBeenCalledWith('Lateness saved');
  });

  it('callApi returns the response unchanged after handling it', async () => {
    const response = { success: true as const, status: 200, data: { id: 'a' } };
    await expect(callApi(Promise.resolve(response))).resolves.toBe(response);
  });
});
