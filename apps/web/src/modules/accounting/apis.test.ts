import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api', () => transport);
vi.mock('@/lib/handleResponse', () => ({
  handleResponse: async ({ response }: { response: unknown }) => response,
}));

import { FINALIZE_PAYROLL_MONTH, GET_PAYROLL_TAXES_LINES, RETURN_PAYROLL_MONTH } from './apis';
import { groupQuery, monthLinesQueryString, parseMonthLinesQuery, parseStatementQuery, statementQueryString } from './lib/lines-query';

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

describe('accounting payroll lines (paged, searched and summed by the API)', () => {
  it('sends the page, size, search and group; nothing more', async () => {
    await GET_PAYROLL_TAXES_LINES('2026-11', { page: 2, limit: 50, search: 'mona', insurance: 'INSURED' });
    expect(transport.apiFetch).toHaveBeenCalledWith(
      '/accounting/payroll/2026-11/lines',
      expect.objectContaining({ params: { page: '2', limit: '50', search: 'mona', insurance: 'INSURED' } }),
    );
  });
});

describe("the month screens' URL", () => {
  it("reads and writes ?q&page&limit, and each statement group's page and size", () => {
    expect(parseMonthLinesQuery({ q: ' mona ', page: '2', limit: '30' })).toEqual({ search: 'mona', page: 2, limit: 25 });
    expect(monthLinesQueryString({ page: 1, limit: 10 })).toBe('');
    expect(monthLinesQueryString({ search: 'a', page: 3, limit: 50 })).toBe('?q=a&page=3&limit=50');
    const st = parseStatementQuery({ q: 'x', insuredPage: '2', notInsuredLimit: '100' });
    expect(st).toEqual({ search: 'x', insured: { page: 2, limit: 10 }, notInsured: { page: 1, limit: 100 } });
    expect(statementQueryString(st)).toBe('?q=x&insuredPage=2&notInsuredLimit=100');
    expect(groupQuery(st, false)).toEqual({ insurance: 'NOT_INSURED', search: 'x', page: 1, limit: 100 });
  });
});
