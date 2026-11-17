// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n, sessionWithout } from '@/test/render';

// A link that reports its href and swallows the navigation (that is the router's job).
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        e.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

import { EmployeeLink, employeePath } from './employee-link';

afterEach(cleanup);

const ID = '33333333-3333-4333-8333-333333333333';

describe('EmployeeLink', () => {
  it("links the name to the employee's profile in the screen's language", () => {
    renderWithI18n(<EmployeeLink employeeId={ID} name="Omar Fathy" code="EMP-0007" detail="Science" />);
    const link = screen.getByRole('link', { name: 'Omar Fathy' });
    expect(link.getAttribute('href')).toBe(`/en/employees/${ID}`);
    // The code and detail are a line under the name, not part of the link.
    expect(screen.getByText('EMP-0007').closest('a')).toBeNull();
    expect(screen.getByText('Science').closest('a')).toBeNull();
  });

  it('Arabic: the Arabic profile', () => {
    renderWithI18n(<EmployeeLink employeeId={ID} name="عمر فتحي" />, { locale: 'ar' });
    expect(screen.getByRole('link', { name: 'عمر فتحي' }).getAttribute('href')).toBe(`/ar/employees/${ID}`);
    expect(employeePath('ar', 'a/b')).toBe('/ar/employees/a%2Fb');
  });

  it('is plain text for someone without hr.employees.view', () => {
    renderWithI18n(<EmployeeLink employeeId={ID} name="Omar Fathy" code="EMP-0007" />, {
      session: sessionWithout('hr.employees.view'),
    });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Omar Fathy')).toBeTruthy();
    expect(screen.getByText('EMP-0007')).toBeTruthy();
  });

  it("never triggers the row's own click or key handlers, and is reachable by Tab", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onRowKey = vi.fn();
    renderWithI18n(
      <div onClick={onRowClick} onKeyDown={onRowKey}>
        <EmployeeLink employeeId={ID} name="Omar Fathy" />
      </div>,
    );
    await user.tab();
    const link = screen.getByRole('link', { name: 'Omar Fathy' });
    expect(document.activeElement).toBe(link);
    await user.keyboard('{Enter}');
    fireEvent.click(link);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onRowKey).not.toHaveBeenCalled();
  });
});
