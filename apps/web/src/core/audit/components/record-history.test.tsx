// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
// The person pickers' choices come from the API (searched there, never here).
const auditApis = vi.hoisted(() => ({ GET_AUDIT_ACTORS: vi.fn() }));
vi.mock('../apis', () => auditApis);
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));

import type { AuditEntry } from '@school-erp/shared';
import { parseHistoryQuery } from '../lib/history-query';
import { ACTORS, AHMED, entry, NOW, renderAudit } from '../test/fixtures';

/** The API's side of the people picker: the log's people, searched by name. */
function serveActors() {
  auditApis.GET_AUDIT_ACTORS.mockImplementation(async (q: { search?: string } = {}) => ({
    success: true,
    status: 200,
    data: ACTORS.filter((a) => a.name.toLowerCase().includes((q.search ?? '').toLowerCase())),
  }));
}
import { RecordHistory } from './record-history';

const BASE = '/en/employees/33333333-3333-4333-8333-333333333333/history';

function renderHistory(params: Record<string, string> = {}, entries: AuditEntry[] = [entry()], locale: 'en' | 'ar' = 'en') {
  return renderAudit(
    <RecordHistory
      basePath={BASE}
      recordName="Omar Fathy"
      query={parseHistoryQuery(params)}
      entries={entries}
      total={entries.length}
      fields={['phone', 'basicSalary']}
      actors={ACTORS}
      now={NOW}
    />,
    locale,
  );
}

describe('RecordHistory (employee History tab)', () => {
  beforeEach(() => {
    serveActors();
    push.mockReset();
  });
  afterEach(cleanup);

  it('field and person filters go into the URL from page 1', async () => {
    const user = userEvent.setup();
    renderHistory({ page: '2' });
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    await user.click(await screen.findByRole('option', { name: 'Basic salary' }));
    expect(push).toHaveBeenLastCalledWith(`${BASE}?field=basicSalary`, { scroll: false });

    await user.click(screen.getByRole('combobox', { name: 'Who' }));
    await user.click(await screen.findByRole('option', { name: 'Ahmed Mahmoud' }));
    expect(push).toHaveBeenLastCalledWith(`${BASE}?person=${AHMED.id}`, { scroll: false });
    // The record's people come from the API (searched there).
    expect(auditApis.GET_AUDIT_ACTORS).toHaveBeenCalledWith(expect.objectContaining({ search: '', limit: 20 }));
  });

  it('shows the record’s entries by month, with the last change', () => {
    renderHistory();
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(screen.getByText("Who changed what on Omar Fathy's record, newest first.")).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '12 min ago · Mona Ibrahim')).toBeTruthy();
  });

  it('empty: nothing recorded yet vs no match for the filters', async () => {
    const user = userEvent.setup();
    renderHistory({}, []);
    expect(screen.getByText('No changes recorded yet')).toBeTruthy();
    // Nothing to page: no "Showing 0–0 of 0", no paging buttons.
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
    cleanup();
    renderHistory({ field: 'phone', person: AHMED.id }, []);
    expect(screen.getByText('No changes match these filters')).toBeTruthy();
    // The message names what is narrowing the list.
    expect(
      screen.getByText('Nothing matches the field Phone and the person Ahmed Mahmoud. Remove one of them or clear the filters.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
    push.mockClear();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters · 2' })[0]!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenLastCalledWith(BASE, { scroll: false });
  });

  it('on narrow screens the filters sit behind one Filters button, like Activity', async () => {
    const user = userEvent.setup();
    renderHistory({ field: 'phone' });
    await user.click(screen.getByRole('button', { name: 'Filters, 1 on' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(sheet).toBeTruthy();
    expect(within(sheet).getByRole('combobox', { name: 'Field' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists the employee’s penalties too: recorded → approved, in words, in English and Arabic', () => {
    const penalty = { entityType: 'penalty' as const, entityId: '55555555-5555-4555-8555-555555555555' };
    const recorded = entry({
      ...penalty,
      action: 'hr.penalty.record',
      at: '2026-11-16T09:00:00.000Z',
      changes: [
        { field: 'violationId', before: null, after: { nameEn: 'Late arrival', nameAr: 'التأخر' } },
        { field: 'date', before: null, after: '2026-11-16' },
        { field: 'level', before: null, after: 2 },
        { field: 'action', before: null, after: 'DEDUCT_DAYS' },
        { field: 'days', before: null, after: 1 },
        { field: 'status', before: null, after: 'PENDING' },
      ],
    });
    const approved = entry({
      ...penalty,
      action: 'hr.penalty.approve',
      actor: AHMED,
      changes: [{ field: 'status', before: 'PENDING', after: 'APPROVED' }],
    });
    renderHistory({}, [approved, recorded, entry({ at: '2026-11-15T09:00:00.000Z' })]);
    const [first, second, third] = screen.getAllByTestId('audit-entry');
    expect(first!.textContent).toContain('Approved the penalty for Omar Fathy');
    expect(within(first!).getByText('Pending')).toBeTruthy();
    expect(within(first!).getByText('Approved')).toBeTruthy();
    expect(second!.textContent).toContain('Recorded a penalty for Omar Fathy');
    expect(within(second!).getByText('Late arrival')).toBeTruthy();
    expect(within(second!).getByText('Deduct days')).toBeTruthy();
    // Never the raw enums.
    expect(second!.textContent).not.toMatch(/DEDUCT_DAYS|PENDING/);
    // The employee's own edit is still there, below.
    expect(third!.textContent).toContain('Omar Fathy');
    cleanup();

    renderHistory({}, [approved, recorded], 'ar');
    const [arFirst, arSecond] = screen.getAllByTestId('audit-entry');
    expect(arFirst!.textContent).toContain('اعتماد جزاء عمر فتحي');
    expect(within(arFirst!).getByText('معتمد')).toBeTruthy();
    expect(within(arSecond!).getByText('التأخر')).toBeTruthy();
    expect(arSecond!.textContent).not.toMatch(/DEDUCT_DAYS|PENDING/);
  });

  it('Arabic: translated labels and field names', () => {
    renderHistory({}, [entry()], 'ar');
    expect(screen.getByRole('heading', { name: 'سجل التغييرات' })).toBeTruthy();
    expect(screen.getAllByText('رقم الهاتف').length).toBeGreaterThan(0);
  });
});
