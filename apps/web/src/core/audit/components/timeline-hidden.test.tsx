// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));

import { entry, NOW, renderAudit } from '../test/fixtures';
import { AuditTimeline } from './timeline';

afterEach(cleanup);

/* P4 (R7): a salary change the viewer may not see reads "changed" without the amounts. */
describe('AuditTimeline — hidden salary values', () => {
  const edited = entry({
    action: 'hr.employee.update',
    changes: [
      { field: 'phone', before: '01000000000', after: '01111111111' },
      { field: 'basicSalary', hidden: true } as never,
    ],
    at: '2026-11-17T08:15:00.000Z',
  });

  it('shows the field as changed, with no figures', () => {
    renderAudit(<AuditTimeline entries={[edited]} grouping="day" now={NOW} label="Activity timeline" />);
    expect(screen.getByText('Changed (amount hidden)')).toBeTruthy();
    expect(screen.getByText('01111111111')).toBeTruthy();
    expect(screen.queryByText(/\d{1,3}(,\d{3})*\.\d{2}/)).toBeNull();
  });

  it('Arabic', () => {
    renderAudit(<AuditTimeline entries={[edited]} grouping="day" now={NOW} label="السجل" />, 'ar');
    expect(screen.getByText('تم التغيير (المبلغ مخفي)')).toBeTruthy();
  });
});
