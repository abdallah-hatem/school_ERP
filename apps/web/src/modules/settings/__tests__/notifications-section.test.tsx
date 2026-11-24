// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NOTIFICATION_TYPE_KEYS, NOTIFICATION_TYPES, type NotificationSettings } from '@school-erp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET_HR_SETTINGS: vi.fn(), UPDATE_HR_SETTINGS: vi.fn() }));
const core = vi.hoisted(() => ({ GET_NOTIFICATION_SETTINGS: vi.fn(), UPDATE_NOTIFICATION_SETTINGS: vi.fn() }));
vi.mock('../apis', () => api);
vi.mock('@/core/notifications/apis', () => core);
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { NotificationsSection } from '../components/notifications-section';
import { sessionWithout } from '@/test/render';
import { hrSettings, ok, renderSettings } from './helpers';

const SETTINGS: NotificationSettings = {
  channels: [{ channel: 'in_app', available: true }],
  defaults: NOTIFICATION_TYPE_KEYS.map((type) => {
    const def = NOTIFICATION_TYPES[type];
    return { type, module: def.module, category: def.category, channel: 'in_app' as const, enabled: true, locked: !def.canTurnOff };
  }),
  retention: { readDays: 90, resolvedDays: 30, maxDays: 365 },
};

const REMINDERS = {
  contractEndDays: 30,
  contractEndSecondDays: 7,
  probationEndDays: 7,
  latenessCheckDay: 25,
  payrollCheckDay: 28,
  renewalDecisionsDays: 91,
  noticeWindowCloseDays: 7,
};

async function loaded() {
  await screen.findByText('What everyone receives');
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}
const toggle = (name: string) => screen.getAllByRole('switch', { name })[0] as HTMLButtonElement;
const field = (name: RegExp) => screen.getByRole('textbox', { name }) as HTMLInputElement;

describe('Settings → Notifications (§11, option A)', () => {
  beforeEach(() => {
    core.GET_NOTIFICATION_SETTINGS.mockImplementation(() => ok(SETTINGS));
    api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('the System admin turns a default off and changes a retention: only those are sent', async () => {
    const user = userEvent.setup();
    core.UPDATE_NOTIFICATION_SETTINGS.mockImplementation(() => ok(SETTINGS));
    renderSettings(<NotificationsSection />);
    await loaded();
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    // Approvals can't be turned off, even by the school.
    expect(toggle('Penalty waiting for approval').disabled).toBe(true);
    await user.click(toggle('Contract ends soon'));
    expect(screen.getAllByText('Off by default').length).toBeGreaterThan(0);
    await user.clear(field(/Keep read notifications/));
    await user.type(field(/Keep read notifications/), '60');
    expect(save.disabled).toBe(false);
    await user.click(save);
    await waitFor(() => expect(core.UPDATE_NOTIFICATION_SETTINGS).toHaveBeenCalledTimes(1));
    expect(core.UPDATE_NOTIFICATION_SETTINGS).toHaveBeenCalledWith({
      defaults: [{ type: 'hr.contract.ending_soon', channel: 'in_app', enabled: false }],
      retention: { readDays: 60 },
    });
    expect(api.UPDATE_HR_SETTINGS).not.toHaveBeenCalled();
  });

  it('a retention out of 1–3,650 days blocks saving with its message', async () => {
    const user = userEvent.setup();
    renderSettings(<NotificationsSection />);
    await loaded();
    await user.clear(field(/Keep any notification at most/));
    await user.type(field(/Keep any notification at most/), '4000');
    expect(await screen.findByText('Between 1 and 3,650 days.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the HR manager (view only) sees the defaults and the retention read-only, and may still change HR timings', async () => {
    const user = userEvent.setup();
    api.UPDATE_HR_SETTINGS.mockImplementation(() => ok({ ...hrSettings, employees: { defaultProbationMonths: 4 } }));
    renderSettings(<NotificationsSection />, 'en', sessionWithout('core.notifications.manage'));
    await loaded();
    expect(screen.getAllByText('You can see these settings; a System admin changes them.').length).toBe(2);
    expect(toggle('Contract ends soon').disabled).toBe(true);
    expect(field(/Keep read notifications/).disabled).toBe(true);
    const months = field(/Default probation length/);
    expect(months.disabled).toBe(false);
    await user.clear(months);
    await user.type(months, '4');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.UPDATE_HR_SETTINGS).toHaveBeenCalledWith({ employees: { defaultProbationMonths: 4 } }));
    expect(core.UPDATE_NOTIFICATION_SETTINGS).not.toHaveBeenCalled();
  });

  it('without view nor edit of anything: no Save bar; without HR rules: no timing card', async () => {
    renderSettings(<NotificationsSection />, 'en', sessionWithout('core.notifications.manage', 'hr.settings.view', 'hr.settings.edit'));
    await loaded();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByText('Reminder timing')).toBeNull();
    expect(api.GET_HR_SETTINGS).not.toHaveBeenCalled();
  });

  it('the reminder timings are saved as HR rules (only what changed); the second must be fewer days', async () => {
    const user = userEvent.setup();
    api.GET_HR_SETTINGS.mockImplementation(() => ok({ ...hrSettings, reminders: REMINDERS }));
    api.UPDATE_HR_SETTINGS.mockImplementation(() => ok({ ...hrSettings, reminders: { ...REMINDERS, latenessCheckDay: 20 } }));
    renderSettings(<NotificationsSection />);
    await loaded();
    expect(field(/^Contract reminder/).value).toBe('30');
    await user.clear(field(/Second contract reminder/));
    await user.type(field(/Second contract reminder/), '40');
    expect(await screen.findByText('0 to 60 days, and fewer than the first reminder.')).toBeTruthy();
    await user.clear(field(/Second contract reminder/));
    await user.type(field(/Second contract reminder/), '7');
    await user.clear(field(/Lateness check day/));
    await user.type(field(/Lateness check day/), '20');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.UPDATE_HR_SETTINGS).toHaveBeenCalledWith({ reminders: { latenessCheckDay: 20 } }));
  });

  it('the skeleton is the loaded list traced: same column headers, groups and one switch per type, each in the same place', async () => {
    let answer: (v: unknown) => void = () => {};
    core.GET_NOTIFICATION_SETTINGS.mockImplementation(() => new Promise((r) => (answer = r)));
    renderSettings(<NotificationsSection />);
    const shape = () => {
      const list = document.querySelector('[data-skeleton-block="notification-types"]')!;
      return {
        headers: Array.from(list.querySelectorAll('[role="columnheader"]')).map((h) => h.textContent),
        groups: Array.from(list.querySelectorAll('[role="rowgroup"] > [role="row"]:not([data-skeleton-each])')).map((g) => g.textContent),
        rows: list.querySelectorAll('[data-skeleton-each]').length,
        switches: Array.from(list.querySelectorAll('[data-slot="switch"]')).map((s) => s.getAttribute('aria-label')),
      };
    };
    await waitFor(() => expect(document.querySelector('[aria-busy="true"] [data-skeleton-block="notification-types"]')).not.toBeNull());
    const skeleton = shape();
    expect(skeleton.headers).toEqual(['Notification', 'For everyone']);
    expect(skeleton.rows).toBe(NOTIFICATION_TYPE_KEYS.length * 2); // the table row and the phone card
    expect(skeleton.switches.length).toBe(skeleton.rows);
    // Inside the form Radix adds a hidden native checkbox per switch: aria-hidden, so the mask leaves it unpainted.
    const twins = document.querySelectorAll('[aria-busy="true"] input[type="checkbox"]');
    expect(twins.length).toBeGreaterThan(0);
    twins.forEach((input) => expect(input.getAttribute('aria-hidden')).toBe('true'));
    answer({ success: true, status: 200, data: SETTINGS });
    await loaded();
    expect(shape()).toEqual(skeleton);
  });

  it('while the form saves, the changed switch is pending (busy, at its new value) and no switch can be flipped', async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => {};
    core.UPDATE_NOTIFICATION_SETTINGS.mockImplementation(() => new Promise((r) => (answer = r)));
    renderSettings(<NotificationsSection />);
    await loaded();
    await user.click(toggle('Contract ends soon'));
    expect(toggle('Contract ends soon').hasAttribute('data-pending')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toggle('Contract ends soon').getAttribute('aria-busy')).toBe('true'));
    expect(toggle('Contract ends soon').getAttribute('aria-checked')).toBe('false');
    expect(toggle('Contract ends soon').disabled).toBe(false);
    // Unchanged ones aren't marked, and can't be flipped mid-save either.
    expect(toggle('Probation ends soon').hasAttribute('data-pending')).toBe(false);
    await user.click(toggle('Probation ends soon'));
    expect(toggle('Probation ends soon').getAttribute('aria-checked')).toBe('true');
    answer({
      success: true,
      status: 200,
      data: { ...SETTINGS, defaults: SETTINGS.defaults.map((d) => (d.type === 'hr.contract.ending_soon' ? { ...d, enabled: false } : d)) },
    });
    await waitFor(() => expect(toggle('Contract ends soon').hasAttribute('data-pending')).toBe(false));
    expect(toggle('Contract ends soon').getAttribute('aria-checked')).toBe('false');
  });

  it('reads in Arabic', async () => {
    renderSettings(<NotificationsSection />, 'ar');
    expect(await screen.findByText('ما يصل إلى الجميع')).toBeTruthy();
    expect(screen.getByText('مدة حفظ الإشعارات')).toBeTruthy();
  });
});
