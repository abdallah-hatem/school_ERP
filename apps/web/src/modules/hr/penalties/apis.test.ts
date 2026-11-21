import { PenaltyAction } from '@school-erp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', () => transport);
vi.mock('@/lib/handleResponse', () => ({
  handleResponse: async ({ response }: { response: unknown }) => response,
}));

import { APPROVE_PENALTY, CANCEL_PENALTY, CREATE_PENALTY } from './apis';

/*
 * Every penalty write (a backdated approval's recount included) passes tags, so `apiFetch` expires
 * them with `updateTag` and the browser drops its router cache: the employee's History opened
 * straight after shows the new entries (`src/lib/revalidate.ts`, dry run 2026-11-20 b).
 */
beforeEach(() => {
  transport.apiFetch.mockReset();
  transport.apiFetch.mockResolvedValue({ success: true, status: 200, data: {} });
});

describe('penalty writes', () => {
  it.each([
    ['record', () => CREATE_PENALTY({ employeeId: 'e-1', violationId: 'v-1', date: '2026-11-19' })],
    ['approve (with a recount)', () => APPROVE_PENALTY('p-1', [{ id: 'p-2', level: 3, action: PenaltyAction.DEDUCT_DAYS, days: 1 }])],
    ['cancel', () => CANCEL_PENALTY('p-1', 'Recorded twice')],
  ] as const)('%s expires the cached penalty screens', async (_name, write) => {
    await write();
    const [, options] = transport.apiFetch.mock.calls[0] as [string, { revalidateTags?: string[] }];
    expect(options.revalidateTags?.length).toBeGreaterThan(0);
  });
});
