// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/en' }));
vi.mock('@/core/auth', () => ({ signOut: vi.fn() }));

import type { SessionUser } from '@school-erp/shared';
import { renderWithI18n, TEST_SESSION } from '@/test/render';
import { UserChip } from './user-chip';

afterEach(cleanup);

const chipAvatar = () => screen.getAllByRole('link')[0]!.querySelector('[data-avatar]') as HTMLElement;
const signedIn = (employee: SessionUser['employee']): SessionUser => ({ ...TEST_SESSION, employee });

describe('UserChip', () => {
  it('the linked employee’s photo, never initials', () => {
    renderWithI18n(<UserChip user={signedIn({ photoUrl: '/files/employee-photos/admin.jpg', gender: 'FEMALE' })} />);
    expect(chipAvatar().dataset.avatar).toBe('photo');
    expect(chipAvatar().textContent).toBe('');
  });

  it('no photo → their gender’s silhouette; on the tablet rail too', () => {
    renderWithI18n(<UserChip user={signedIn({ photoUrl: null, gender: 'FEMALE' })} compact />);
    expect(chipAvatar().querySelector('[data-silhouette]')?.getAttribute('data-silhouette')).toBe('female');
  });

  it('no linked employee → the neutral silhouette', () => {
    renderWithI18n(<UserChip user={signedIn(null)} />, { locale: 'ar' });
    expect(chipAvatar().querySelector('[data-silhouette]')?.getAttribute('data-silhouette')).toBe('neutral');
    expect(chipAvatar().textContent).toBe('');
  });
});
