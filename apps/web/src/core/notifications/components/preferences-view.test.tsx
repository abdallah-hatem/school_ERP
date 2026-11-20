// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationPreferences } from '@school-erp/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ UPDATE_NOTIFICATION_PREFERENCES: vi.fn() }));
vi.mock('../apis', () => api);
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { renderWithI18n, sessionWith } from '@/test/render';
import { NotificationsI18n } from '../messages';
import { NotificationPreferencesSkeleton, NotificationPreferencesView } from './preferences-view';

const channel = (enabled: boolean, personal: boolean | null, locked = false) => [
  { channel: 'in_app' as const, enabled, schoolDefault: true, personal, locked },
];

const PREFS: NotificationPreferences = {
  channels: [{ channel: 'in_app', available: true }],
  types: [
    { type: 'hr.penalty.awaiting_approval', module: 'hr', category: 'approval', canTurnOff: false, channels: channel(true, null, true) },
    { type: 'hr.contract.ending_soon', module: 'hr', category: 'reminder', canTurnOff: true, channels: channel(true, null) },
    { type: 'hr.probation.ending_soon', module: 'hr', category: 'reminder', canTurnOff: true, channels: channel(false, false) },
  ],
};

function render(prefs = PREFS, locale: 'en' | 'ar' = 'en') {
  return renderWithI18n(
    <NotificationsI18n locale={locale}>
      <NotificationPreferencesView initial={prefs} />
    </NotificationsI18n>,
    { locale },
  );
}

/** The wide list's switch (the phone cards draw the same switches, hidden by a container query). */
const toggle = (name: string) => screen.getAllByRole('switch', { name })[0] as HTMLButtonElement;

describe('My account → Notifications (option A, in-app only)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('a required type is on, locked and says "Required"; no other channel is mentioned', () => {
    render();
    const required = toggle('Penalty waiting for approval');
    expect(required.getAttribute('aria-checked')).toBe('true');
    expect(required.disabled).toBe(true);
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/email|whatsapp|sms/i);
  });

  it('a change shows at once and is saved; a failure puts the switch back', async () => {
    const user = userEvent.setup();
    let fail: (v: unknown) => void = () => {};
    api.UPDATE_NOTIFICATION_PREFERENCES.mockImplementation(() => new Promise((r) => (fail = r)));
    render();
    await user.click(toggle('Contract ends soon'));
    expect(toggle('Contract ends soon').getAttribute('aria-checked')).toBe('false');
    expect(api.UPDATE_NOTIFICATION_PREFERENCES).toHaveBeenCalledWith([{ type: 'hr.contract.ending_soon', channel: 'in_app', enabled: false }]);
    // While it saves, the same switch can't send a second request.
    expect(toggle('Contract ends soon').disabled).toBe(true);
    fail({ success: false, status: 500, message: 'Server error' });
    await waitFor(() => expect(toggle('Contract ends soon').getAttribute('aria-checked')).toBe('true'));
    expect(toggle('Contract ends soon').disabled).toBe(false);
  });

  it('a switch off the school default says so; "Reset to school default" sends null and shows the school’s value', async () => {
    const user = userEvent.setup();
    const after: NotificationPreferences = {
      ...PREFS,
      types: PREFS.types.map((t) => (t.type === 'hr.probation.ending_soon' ? { ...t, channels: channel(true, null) } : t)),
    };
    api.UPDATE_NOTIFICATION_PREFERENCES.mockImplementation(() => Promise.resolve({ success: true, status: 200, data: after }));
    render();
    expect(screen.getAllByText('Changed from school default').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Reset to school default' })[0]!);
    expect(api.UPDATE_NOTIFICATION_PREFERENCES).toHaveBeenCalledWith([{ type: 'hr.probation.ending_soon', channel: 'in_app', enabled: null }]);
    await waitFor(() => expect(toggle('Probation ends soon').getAttribute('aria-checked')).toBe('true'));
    expect(screen.queryByText('Changed from school default')).toBeNull();
  });

  it('groups by module and category, in Arabic too', () => {
    render(PREFS, 'ar');
    expect(screen.getAllByText('شؤون الموظفين · في انتظارك').length).toBeGreaterThan(0);
    expect(screen.getAllByText('شؤون الموظفين · تذكيرات').length).toBeGreaterThan(0);
    expect(toggle('قرب انتهاء العقد')).toBeTruthy();
  });

  it('nothing to receive → says so', () => {
    render({ ...PREFS, types: [] });
    expect(screen.getByText('Nothing to choose yet')).toBeTruthy();
  });

  it('the skeleton lists the types the person’s permissions let them receive', () => {
    renderWithI18n(
      <NotificationsI18n locale="en">
        <NotificationPreferencesSkeleton />
      </NotificationsI18n>,
      { session: sessionWith('hr.employees.edit') },
    );
    expect(screen.getAllByText('Contract ends soon').length).toBeGreaterThan(0);
    expect(screen.queryByText('Penalty waiting for approval')).toBeNull();
  });
});
