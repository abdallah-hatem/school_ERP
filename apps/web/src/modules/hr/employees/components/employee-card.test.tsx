// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));

import { EMPLOYEES_PAGE_SIZE } from '../lib/list-query';
import { stageBandOf } from '../lib/stage-band';
import { item, renderEmployees, summary } from '../test/fixtures';
import { EmployeeCard } from './employee-card';
import { EmployeesListSkeleton } from './employees-skeletons';

const mona = summary({
  id: 'e-1',
  code: 'EMP-0001',
  nameEn: 'Mona Khalil',
  nameAr: 'منى خليل',
  workSystem: 'PART_TIME_3',
  basicSalary: 1650000,
});

describe('EmployeeCard', () => {
  afterEach(cleanup);

  it('shows the name, job title, stage, code, department, work system, salary and status', () => {
    renderEmployees(<EmployeeCard employee={mona} band="band-1" href="/en/employees/e-1" />);
    const card = screen.getByRole('article', { name: 'Mona Khalil' });
    for (const text of ['Teacher', 'Primary', 'EMP-0001', 'Mathematics', 'Part-time, 3 days', '16,500.00', 'Active']) {
      expect(within(card).getByText(text)).toBeTruthy();
    }
    expect(card.getAttribute('data-inactive')).toBeNull();
    expect(within(card).getByRole('link', { name: 'Edit Mona Khalil' }).getAttribute('href')).toBe('/en/employees/e-1/edit');
  });

  it('shows the photo when there is one and the silhouette (not initials) when there is none', () => {
    renderEmployees(
      <ul>
        <EmployeeCard employee={{ ...mona, photoUrl: '/files/employee-photos/e-1-a.jpg' }} band="band-1" href="/en/employees/e-1" />
        <EmployeeCard employee={{ ...mona, id: 'e-2', nameEn: 'Omar Fathy' }} band="band-1" href="/en/employees/e-2" />
      </ul>,
    );
    const withPhoto = screen.getByRole('article', { name: 'Mona Khalil' });
    expect(withPhoto.querySelector('[data-avatar]')?.getAttribute('data-avatar')).toBe('photo');
    expect(withPhoto.querySelector('img')?.getAttribute('src')).toContain('/files/employee-photos/e-1-a.jpg');
    const without = screen.getByRole('article', { name: 'Omar Fathy' });
    expect(without.querySelector('[data-avatar]')?.getAttribute('data-avatar')).toBe('silhouette');
    expect(within(without).queryByText('OF')).toBeNull();
  });

  it('an inactive employee is marked inactive and still opens', () => {
    renderEmployees(<EmployeeCard employee={{ ...mona, status: 'INACTIVE' }} band="band-1" href="/en/employees/e-1" />);
    const card = screen.getByRole('article', { name: 'Mona Khalil' });
    expect(card.getAttribute('data-inactive')).toBe('true');
    expect(within(card).getByText('Inactive')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'View Mona Khalil' }).getAttribute('href')).toBe('/en/employees/e-1');
  });

  it('a 200-character name stays inside the card (wraps, no fixed width)', () => {
    const long = 'Mona '.repeat(40).trim();
    renderEmployees(<EmployeeCard employee={{ ...mona, nameEn: long }} band="band-1" href="/en/employees/e-1" />);
    expect(screen.getByRole('heading', { name: long }).className).toContain('break-words');
  });
});

describe('stageBandOf', () => {
  const stages = [
    item('s-none', 'None', 'بدون مرحلة', true, 0),
    item('s-pri', 'Primary', 'الابتدائي', true, 2),
    item('s-kg', 'Kindergarten', 'رياض الأطفال', true, 1),
  ];
  it('one colour per stage in stage order, neutral for "None" and unknown stages', () => {
    expect(stageBandOf('s-kg', stages)).toBe('band-1');
    expect(stageBandOf('s-pri', stages)).toBe('band-2');
    expect(stageBandOf('s-none', stages)).toBe('band-neutral');
    expect(stageBandOf('s-gone', stages)).toBe('band-neutral');
  });
});

describe('EmployeesListSkeleton', () => {
  afterEach(cleanup);

  it('the list itself, with a full page of card skeletons in the card frame and grid', () => {
    renderEmployees(<EmployeesListSkeleton />);
    const region = screen.getByRole('region', { name: 'Employees' });
    // The list's own header, search and pagination, the cards busy.
    expect(screen.getByRole('heading', { level: 1, name: 'Employees' })).toBeTruthy();
    expect(within(region).getByRole('search')).toBeTruthy();
    const skeletons = within(region).getAllByTestId('employee-card-skeleton');
    expect(skeletons[0]?.closest('[aria-busy="true"]')).not.toBeNull();
    expect(skeletons).toHaveLength(EMPLOYEES_PAGE_SIZE);
    // Same frame as a real card: an article in a list item of the same grid.
    expect(skeletons[0]?.querySelector('article')).not.toBeNull();
    expect(skeletons[0]?.parentElement?.tagName).toBe('UL');
  });
});
