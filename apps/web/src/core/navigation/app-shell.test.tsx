// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/payroll',
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));
// Client-side navigation is the router's job; here a link only needs to fire its onClick.
vi.mock('next/link', () => ({
  default: ({ children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a
      {...props}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
    >
      {children}
    </a>
  ),
}));

import { SchoolBrandingProvider } from '@/core/settings';
import { renderWithI18n } from '@/test/render';
import { AppShell } from './app-shell';

function renderShell() {
  return renderWithI18n(
    <SchoolBrandingProvider initial={{ nameEn: 'Test School', nameAr: 'مدرسة الاختبار', logoUrl: null }}>
      <AppShell>
        <p>page body</p>
      </AppShell>
    </SchoolBrandingProvider>,
  );
}

async function openDrawer() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  renderShell();
  const menuButton = screen.getByRole('button', { name: 'Open menu' });
  await user.click(menuButton);
  const drawer = await screen.findByRole('dialog', { name: 'Main navigation' });
  return { user, menuButton, drawer };
}

describe('AppShell drawer (phone)', () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
  });

  it('Drawer: Esc closes it, focus returns to the menu button', async () => {
    const { user, menuButton } = await openDrawer();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(menuButton));
  });

  it('Drawer: backdrop closes it, focus returns to the menu button', async () => {
    const { user, menuButton } = await openDrawer();
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(menuButton));
  });

  it('Drawer: choosing a link closes it, focus returns to the menu button', async () => {
    const { user, menuButton, drawer } = await openDrawer();
    await user.click(within(drawer).getByRole('link', { name: 'Employees' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(menuButton));
  });

  it('marks the current section in the menu', async () => {
    const { drawer } = await openDrawer();
    const payroll = within(drawer).getAllByRole('link', { name: 'Payroll' }).find((l) => l.getAttribute('href') === '/en/payroll');
    expect(payroll?.getAttribute('aria-current')).toBe('page');
    expect(within(drawer).getByRole('link', { name: 'Employees' }).getAttribute('aria-current')).toBeNull();
  });
});
