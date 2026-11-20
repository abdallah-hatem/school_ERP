import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', () => transport);
vi.mock('@/lib/handleResponse', () => ({
  handleResponse: async ({ response }: { response: unknown }) => response,
}));

import { FINALIZE_PAYROLL_MONTH, RETURN_PAYROLL_MONTH } from './apis';

/*
 * Returning or finalizing a month writes an entry on HR's run: both expire the run's tag, and
 * `apiFetch` then drops the browser's router cache (`src/lib/revalidate.ts`), so the run's History
 * shows the entry without a reload (dry run 2026-11-20 b, finding 1).
 */
const RUN = 'run-1';

beforeEach(() => {
  transport.apiFetch.mockReset();
  transport.apiFetch.mockResolvedValue({ success: true, status: 200, data: null });
});

describe('accounting payroll writes', () => {
  it.each([
    ['return', () => RETURN_PAYROLL_MONTH('2026-11', RUN, { reason: 'Wrong bonus' })],
    ['finalize', () => FINALIZE_PAYROLL_MONTH('2026-11', RUN)],
  ] as const)('%s expires HR’s run', async (_name, write) => {
    await write();
    const [, options] = transport.apiFetch.mock.calls[0] as [string, { revalidateTags?: string[] }];
    expect(options.revalidateTags).toEqual(expect.arrayContaining(['hr-payroll-runs', `hr-payroll-run-${RUN}`]));
  });
});
