// @vitest-environment jsdom
import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/render';
import type { BrowserEnv } from '../browser';
import { setInstallPromptForTest, type BeforeInstallPromptEvent } from '../install-prompt';
import { InstallApp } from './install-app';

/*
 * My account → Install app (owner, 2026-11-21): the browser's own install dialog where it offers
 * one, the Add to Home Screen steps on an iPhone, "Installed" once it is — and nothing at all where
 * the browser can't install (no banner, no nagging).
 */

const env = (ua: string, standalone = false, maxTouchPoints = 0): BrowserEnv => ({
  navigator: { userAgent: ua, maxTouchPoints, standalone },
  isSecureContext: true,
  matchMedia: () => ({ matches: standalone }),
});
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

function offer(outcome: 'accepted' | 'dismissed'): BeforeInstallPromptEvent {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
}

describe('Install app', () => {
  afterEach(() => {
    cleanup();
    act(() => setInstallPromptForTest(null));
  });

  it('a browser that can’t install (no offer, not an iPhone) shows nothing', () => {
    const { container } = renderWithI18n(<InstallApp env={env(CHROME)} />);
    expect(container.textContent).toBe('');
  });

  it('the browser offers to install: a button that opens its own dialog; accepted → Installed', async () => {
    const user = userEvent.setup();
    const event = offer('accepted');
    act(() => setInstallPromptForTest(event));
    renderWithI18n(<InstallApp env={env(CHROME)} />);
    expect(screen.getByTestId('install-app').dataset.state).toBe('prompt');
    await user.click(screen.getByRole('button', { name: 'Install app' }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Installed on this device')).toBeTruthy();
  });

  it('dismissed → the entry goes away (the browser decides when to offer again)', async () => {
    const user = userEvent.setup();
    act(() => setInstallPromptForTest(offer('dismissed')));
    const { container } = renderWithI18n(<InstallApp env={env(CHROME)} />);
    await user.click(screen.getByRole('button', { name: 'Install app' }));
    await vi.waitFor(() => expect(container.textContent).toBe(''));
  });

  it.each([
    ['en', 'Add to Home Screen', 'Tap the Share button in Safari\'s toolbar.'],
    ['ar', 'إضافة إلى الشاشة الرئيسية', 'اضغط زر المشاركة في شريط Safari.'],
  ] as const)('an iPhone in Safari (%s): the Add to Home Screen steps', (locale, title, step1) => {
    renderWithI18n(<InstallApp env={env(IPHONE)} />, { locale });
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByText(step1)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('an iPad in desktop mode counts as iOS (it says Macintosh but has touch)', () => {
    renderWithI18n(<InstallApp env={env(IPAD_DESKTOP_MODE, false, 5)} />);
    expect(screen.getByTestId('install-app').dataset.state).toBe('ios');
  });

  it('already running as the installed app: a quiet "Installed on this device"', () => {
    renderWithI18n(<InstallApp env={env(IPHONE, true)} />);
    expect(screen.getByTestId('install-app').dataset.state).toBe('installed');
    expect(screen.getByText('Installed on this device')).toBeTruthy();
  });
});
