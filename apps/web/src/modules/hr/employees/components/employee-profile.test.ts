import { describe, expect, it, vi } from 'vitest';

vi.mock('../apis', () => ({ DEACTIVATE_EMPLOYEE: vi.fn(), REACTIVATE_EMPLOYEE: vi.fn() }));

const { activeProfileTab } = await import('./employee-profile');

describe('activeProfileTab (the profile layout reads the tab from the URL)', () => {
  const href = '/en/employees/7f1c';

  it('is details at the profile root', () => {
    expect(activeProfileTab('/en/employees/7f1c', href)).toBe('details');
  });

  it('is the first segment after the profile', () => {
    expect(activeProfileTab('/en/employees/7f1c/penalties', href)).toBe('penalties');
    expect(activeProfileTab('/en/employees/7f1c/payroll', href)).toBe('payroll');
    expect(activeProfileTab('/en/employees/7f1c/payroll/extra', href)).toBe('payroll');
  });

  it('falls back to details for an unknown segment or another path', () => {
    expect(activeProfileTab('/en/employees/7f1c/unknown', href)).toBe('details');
    expect(activeProfileTab('/ar/employees/other', href)).toBe('details');
  });
});
