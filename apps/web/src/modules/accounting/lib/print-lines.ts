'use client';

import { PAYROLL_PAGINATION, type AccountingPayrollLine, type AccountingPayrollLinesPage, type AccountingPayrollLinesQuery, type Month } from '@school-erp/shared';
import { callApi } from '@/lib/callApi';
import { GET_PAYROLL_TAXES_LINES } from '../apis';

/**
 * Every line of the month (or of one group), for print: the API's pages of 500, read one after the
 * other — never the page on screen, never the search. `null` when a page fails.
 */
export async function loadEveryLine(
  month: Month,
  insurance?: AccountingPayrollLinesQuery['insurance'],
): Promise<AccountingPayrollLine[] | null> {
  const out: AccountingPayrollLine[] = [];
  for (let page = 1; ; page++) {
    const res = await callApi(GET_PAYROLL_TAXES_LINES(month, { insurance, page, limit: PAYROLL_PAGINATION.maxLimit }), {
      showErrorToast: false,
    });
    if (!res.success || !res.data) return null;
    const answer: AccountingPayrollLinesPage = res.data;
    out.push(...answer.items);
    if (out.length >= answer.total || answer.items.length === 0) return out;
  }
}
