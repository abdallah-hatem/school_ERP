// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const apis = vi.hoisted(() => ({
  APPROVE_PENALTY: vi.fn(),
  CANCEL_PENALTY: vi.fn(),
  CREATE_PENALTY: vi.fn(),
  GET_PENALTY_PREVIEW: vi.fn(),
}));
vi.mock('../apis', () => apis);

import { employee } from '../../employees/test/fixtures';
import { violationGroups } from '../lib/penalty-text';
import { groups, ok, record, renderPenalties } from '../test/fixtures';
import { EmployeePenalties } from './employee-penalties';

function renderTab(overrides: Partial<Parameters<typeof EmployeePenalties>[0]> = {}) {
  return renderPenalties(
    <EmployeePenalties
      employeesPath="/en/employees"
      employee={employee}
      rows={[record(), record({ id: 'p-0', date: '2026-10-02', status: 'APPROVED' })]}
      total={25}
      page={1}
      limit={20}
      violations={violationGroups(groups, 'en')}
      {...overrides}
    />,
  );
}

const table = () => within(document.querySelector<HTMLElement>('[data-view="table"]')!);

describe('EmployeePenalties (profile tab)', () => {
  beforeEach(() => {
    router.push.mockReset();
    apis.GET_PENALTY_PREVIEW.mockReset();
  });
  afterEach(cleanup);

  it('lists the penalties of every month with the row actions, without an employee column', () => {
    renderTab();
    expect(table().queryByRole('columnheader', { name: 'Employee' })).toBeNull();
    expect(table().getAllByRole('row')).toHaveLength(3);
    expect(table().getByRole('button', { name: 'Approve the penalty of Mona Khalil' })).toBeTruthy();
  });

  it('pages through the URL without scrolling', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(router.push).toHaveBeenLastCalledWith('/en/employees/e-mona/penalties?page=2', { scroll: false });
  });

  it('records a penalty for this employee: the employee is already picked', async () => {
    const user = userEvent.setup();
    apis.GET_PENALTY_PREVIEW.mockResolvedValue(ok({ level: 1, action: 'NOTICE', days: null, priorCount: 0 }));
    renderTab();
    await user.click(screen.getByRole('button', { name: 'Record a penalty' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record a penalty' });
    expect(within(dialog).getByRole('combobox', { name: /Employee/ }).textContent).toContain('Mona Khalil · EMP-0001');
    await user.click(within(dialog).getByRole('combobox', { name: /Violation/ }));
    await user.click(await screen.findByRole('option', { name: 'Late arrival without notice' }));
    await waitFor(() => expect(screen.getByTestId('penalty-preview').textContent).toBe('Level 1 — Notice'));
  });

  it('an inactive employee gets no "Record a penalty"', () => {
    renderTab({ employee: { ...employee, status: 'INACTIVE' }, rows: [] , total: 0 });
    expect(screen.getByText('No penalties yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record a penalty' })).toBeNull();
  });
});
