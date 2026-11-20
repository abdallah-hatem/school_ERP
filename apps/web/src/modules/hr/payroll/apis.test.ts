import { AdjustmentType } from '@school-erp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', () => transport);
vi.mock('@/lib/handleResponse', () => ({
  handleResponse: async ({ response }: { response: unknown }) => response,
}));

import { ADD_PAYROLL_ADJUSTMENT, APPROVE_PAYROLL_RUN, RECALCULATE_PAYROLL_RUN, REMOVE_PAYROLL_ADJUSTMENT } from './apis';

/*
 * Every run write expires the run's tag (dry run 2026-11-20 b, finding 1): `apiFetch` expires a
 * write's tags with `updateTag`, which also drops the browser's router cache — so the History tab
 * opened straight after the write reads its entry (`src/lib/revalidate.ts`). A write without tags
 * would leave the History the browser already held.
 */
const RUN = 'run-1';

beforeEach(() => {
  transport.apiFetch.mockReset();
  transport.apiFetch.mockResolvedValue({ success: true, status: 200, data: {} });
});

const writes: [string, () => Promise<unknown>][] = [
  ['Recalculate', () => RECALCULATE_PAYROLL_RUN(RUN)],
  ['Approve', () => APPROVE_PAYROLL_RUN(RUN)],
  [
    'add an adjustment',
    () =>
      ADD_PAYROLL_ADJUSTMENT(RUN, { employeeId: 'e-1', type: AdjustmentType.ADDITION, amount: 10_000, reason: 'Bonus' }),
  ],
  ['remove an adjustment', () => REMOVE_PAYROLL_ADJUSTMENT(RUN, 'adj-1')],
];

describe('payroll run writes', () => {
  it.each(writes)('%s expires the run, so its History is read again', async (_name, write) => {
    await write();
    const [, options] = transport.apiFetch.mock.calls[0] as [string, { revalidateTags?: string[] }];
    expect(options.revalidateTags).toEqual(expect.arrayContaining(['hr-payroll-runs', `hr-payroll-run-${RUN}`]));
  });
});
