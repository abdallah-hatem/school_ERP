// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));

import { entry, NOW, renderAudit } from '../test/fixtures';
import { AuditTimeline } from './timeline';

afterEach(cleanup);

/*
 * Changes whose values are objects (a payroll run's totals, a role's permissions) read as one
 * labelled line per part, in the screen's language — never as JSON.
 */
const TOTALS = {
  employees: 1284,
  monthSalary: 36000000,
  penaltyAmount: 450000,
  latenessAmount: 120000,
  adjustmentAdditions: 50000,
  adjustmentDeductions: 0,
  net: 34770581,
  flagged: 2,
};

const created = entry({
  action: 'hr.payroll.create',
  module: 'hr',
  entityType: 'payroll_run',
  entityId: '44444444-4444-4444-8444-444444444444',
  entityLabel: { en: '2026-11', ar: '2026-11' },
  changes: [{ field: 'totals', before: null, after: TOTALS }],
});

const recalculated = entry({
  action: 'hr.payroll.recalculate',
  module: 'hr',
  entityType: 'payroll_run',
  entityId: '44444444-4444-4444-8444-444444444444',
  entityLabel: { en: '2026-11', ar: '2026-11' },
  changes: [{ field: 'totals', before: TOTALS, after: { ...TOTALS, net: 34700581, flagged: 0 } }],
});

function show(entries = [created], locale: 'en' | 'ar' = 'en') {
  return renderAudit(
    <AuditTimeline entries={entries} grouping="month" now={NOW} label="Activity timeline" />,
    locale,
  );
}

async function expandAll() {
  const user = userEvent.setup();
  for (const more of screen.queryAllByRole('button', { name: /more/ })) await user.click(more);
}

describe('AuditTimeline — object values', () => {
  it('creating a run reads its net and head count only, money in EGP, no "Totals ·" prefix, no JSON', async () => {
    const { container } = show();
    await expandAll();
    const labels = [...container.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(labels).toEqual(['Net', 'Employees']);
    const dd = [...container.querySelectorAll('dd')].map((d) => d.textContent?.replace(/\s+/g, ' ').trim());
    expect(dd[0]).toMatch(/EGP\s?347,705\.81/);
    expect(dd[1]).toBe('1,284');
    expect(container.textContent).not.toMatch(/[{}"]|Need review|Totals/);
  });

  it('approving a run reads Draft → Approved, then its net — nothing else (owner, 2026-11-20)', () => {
    const approved = entry({
      ...created,
      id: 'approve',
      action: 'hr.payroll.approve',
      changes: [
        { field: 'totals', before: null, after: TOTALS },
        { field: 'status', before: 'DRAFT', after: 'APPROVED' },
      ],
    });
    const { container } = show([approved]);
    expect([...container.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Status', 'Net']);
    expect(container.textContent).toMatch(/Draft/);
    expect(container.textContent).toMatch(/347,705\.81/);
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull();
  });

  it('a recalculation shows only the totals that changed, before → after; "Need review" never', () => {
    const { container } = show([recalculated]);
    const labels = [...container.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(labels).toEqual(['Net']);
    expect(container.textContent).toMatch(/347,705\.81/);
    expect(container.textContent).toMatch(/347,005\.81/);
    expect(container.textContent).not.toMatch(/[{}"]/);
  });

  it('a recalculation whose figures stayed the same says so', () => {
    const same = entry({
      ...recalculated,
      id: 'same',
      changes: [{ field: 'totals', before: TOTALS, after: { ...TOTALS, flagged: 0 } }],
    });
    show([same]);
    expect(screen.getByText('No change in totals')).toBeTruthy();
    cleanup();
    show([same], 'ar');
    expect(screen.getByText('لا تغيير في الإجماليات')).toBeTruthy();
  });

  it('Arabic: the parts in Arabic, money in ج.م (drawn left of the figure, as everywhere)', async () => {
    const { container } = show([created], 'ar');
    await expandAll();
    const labels = [...container.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(labels).toEqual(['الصافي', 'الموظفون']);
    expect(container.querySelector('dd')?.textContent).toMatch(/ج\.م\s?347,705\.81/);
    expect(container.textContent).not.toMatch(/[{}"]|الإجماليات/);
  });

  it('accounting’s recorded taxes read every figure, without the prefix', () => {
    const { container } = show([
      entry({
        action: 'accounting.payroll.record',
        module: 'accounting',
        entityType: 'accounting_payroll',
        entityLabel: { en: '2026-11', ar: '2026-11' },
        actor: null,
        changes: [
          {
            field: 'totals',
            before: null,
            after: { employees: 12, net: 100000, insuranceAmount: 1100, incomeTax: 2000, martyrTax: 50, gross: 103150 },
          },
        ],
      }),
    ]);
    expect([...container.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Net',
      'Employees',
      'Gross salaries',
      'Income tax',
    ]);
    expect(container.textContent).not.toMatch(/[{}"]/);
  });

  it('hidden from a viewer without salaries (R7): one "changed" line, no figures', () => {
    const { container } = show([
      entry({ ...created, id: 'hidden', changes: [{ field: 'totals', hidden: true } as never] }),
    ]);
    expect(screen.getByText('Totals')).toBeTruthy();
    expect(screen.getByText('Changed (amount hidden)')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d{1,3}(,\d{3})*\.\d{2}/);
  });

  it('hidden, in Arabic', () => {
    show([entry({ ...created, id: 'hidden-ar', changes: [{ field: 'totals', hidden: true } as never] })], 'ar');
    expect(screen.getByText('الإجماليات')).toBeTruthy();
    expect(screen.getByText('تم التغيير (المبلغ مخفي)')).toBeTruthy();
  });

  it('a role’s permissions: one line per permission that changed, its name and scope', () => {
    const { container } = show([
      entry({
        action: 'core.role.update',
        module: 'core',
        entityType: 'role',
        entityLabel: { en: 'HR officer', ar: 'مسؤول الموارد البشرية' },
        changes: [
          {
            field: 'permissions',
            before: { 'hr.payroll.view': 'all', 'core.audit.view': 'all' },
            after: { 'hr.payroll.view': 'own_stage', 'core.audit.view': 'all', 'core.settings.view': 'all' },
          },
        ],
      }),
    ]);
    expect([...container.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      expect.stringMatching(/^Permissions · .*payroll/i),
      'Permissions · View school settings',
    ]);
    expect(container.textContent).toMatch(/Everyone/);
    expect(container.textContent).toMatch(/Their stage/);
    expect(container.textContent).not.toMatch(/[{}"]/);
  });

  it('any other object reads as its labelled parts, not JSON', () => {
    const { container } = show([
      entry({ changes: [{ field: 'something', before: null, after: { phone: '01001234567', note: { a: 1 } } }] }),
    ]);
    expect(container.textContent).toMatch(/Phone/);
    expect(container.textContent).not.toMatch(/[{}"]/);
  });
});

/* A month record (payroll run, its taxes, a lateness month) reads as the app prints a month, on one line. */
describe('AuditTimeline — month records', () => {
  const monthEntries = [
    created,
    entry({ ...created, id: 'tax', action: 'accounting.payroll.record', module: 'accounting', entityType: 'accounting_payroll', actor: null }),
    entry({
      ...created,
      id: 'late',
      action: 'hr.lateness.save',
      entityType: 'lateness_month',
      entityId: '2026-11',
      changes: [{ field: 'minutes', before: 10, after: 20 }],
    }),
  ];

  for (const [locale, month] of [
    ['en', 'November 2026'],
    ['ar', 'نوفمبر 2026'],
  ] as const) {
    it(`${locale}: "${month}", never "2026-11", kept together`, () => {
      const { container } = show(monthEntries, locale);
      const months = screen.getAllByText(month, { selector: 'bdi' });
      expect(months).toHaveLength(3);
      for (const m of months) expect(m.className).toMatch(/whitespace-nowrap/);
      expect(container.textContent).not.toMatch(/2026-11/);
    });
  }

  it('another record whose label looks like a month stays as it is', () => {
    show([entry({ entityLabel: { en: '2026-11', ar: '2026-11' } })]);
    expect(screen.getByText('2026-11', { selector: 'bdi' })).toBeTruthy();
  });
});
