// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_SCHOOL_SETTINGS_FOR_EDIT: vi.fn(),
  UPDATE_SCHOOL_SETTINGS: vi.fn(),
  UPLOAD_SCHOOL_LOGO: vi.fn(),
  GET_HR_SETTINGS: vi.fn(),
  UPDATE_HR_SETTINGS: vi.fn(),
  GET_LIST_ITEMS: vi.fn(),
  CREATE_LIST_ITEM: vi.fn(),
  UPDATE_LIST_ITEM: vi.fn(),
  GET_SETTINGS_HISTORY: vi.fn(),
  GET_PENALTY_GROUPS: vi.fn(),
  CREATE_PENALTY_GROUP: vi.fn(),
  UPDATE_PENALTY_GROUP: vi.fn(),
  CREATE_VIOLATION: vi.fn(),
  UPDATE_VIOLATION: vi.fn(),
  GET_SCHOOL_CALENDAR: vi.fn(),
  PUT_SCHOOL_CALENDAR: vi.fn(),
}));
vi.mock('../apis', () => api);

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/settings',
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

// The shell's menu links are <Link>s; here one only needs to be a real anchor the guard can stop.
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

import Link from 'next/link';
import { SchoolBrand } from '@/core/settings/school-brand';
import { LocaleSwitch } from '@/shared/components/layout/locale-switch';
import { SettingsScreen } from '../components/settings-screen';
import type { SessionUser } from '@school-erp/shared';
import { sessionWith, sessionWithout, STAGE_HEAD_KEYS, TEST_SESSION } from '@/test/render';
import { deferred, hrSettings, ok, renderSettings, school } from './helpers';
function renderScreen(locale: 'en' | 'ar' = 'en', session: SessionUser = TEST_SESSION) {
  return renderSettings(
    <>
      <header data-testid="shell">
        <SchoolBrand />
        <Link href="/en/payroll">Payroll link</Link>
        <LocaleSwitch />
      </header>
      <SettingsScreen initialSection="school" />
    </>,
    locale,
    session,
  );
}

async function field(name: RegExp) {
  return (await screen.findByRole('textbox', { name })) as HTMLInputElement;
}

describe('Settings screen — school section', () => {
  beforeEach(() => {
    api.GET_SCHOOL_SETTINGS_FOR_EDIT.mockImplementation(() => ok(school));
    api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
    api.GET_SCHOOL_CALENDAR.mockImplementation((year: number) => ok({ year, calendar: null }));
    URL.createObjectURL = vi.fn(() => 'blob:preview-logo');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    // A section switch writes `?section=` into the (jsdom) address bar; the next test starts clean.
    window.history.replaceState(null, '', '/');
  });

  it('field errors shown inline in the current language; save disabled while invalid or saving', async () => {
    const user = userEvent.setup();
    renderScreen('ar');
    const nameAr = await field(/اسم المدرسة بالعربية/);
    const save = screen.getByRole('button', { name: 'حفظ' });
    expect(save).toHaveProperty('disabled', true); // nothing changed yet

    await user.clear(nameAr);
    expect(await screen.findByText('هذا الحقل مطلوب.')).toBeTruthy();
    expect(nameAr.getAttribute('aria-invalid')).toBe('true');
    expect(save).toHaveProperty('disabled', true);

    await user.type(nameAr, 'مدرسة النيل');
    // Work end is a dropdown of half hours, 12-hour with ص/م (no-break space before the period).
    const workEnd = screen.getByRole('combobox', { name: /نهاية العمل/ });
    await user.click(workEnd);
    expect(screen.queryByRole('option', { name: '7:15\u00a0ص' })).toBeNull();
    await user.click(await screen.findByRole('option', { name: '7:00\u00a0ص' }));
    expect(await screen.findByText('يجب أن تكون نهاية العمل بعد بدايته.')).toBeTruthy();
    expect(save).toHaveProperty('disabled', true);
    expect(api.UPDATE_SCHOOL_SETTINGS).not.toHaveBeenCalled();

    // Valid again → enabled; while saving it is busy and a second click sends nothing.
    await user.click(workEnd);
    await user.click(await screen.findByRole('option', { name: '2:30\u00a0م' }));
    await waitFor(() => expect(save).toHaveProperty('disabled', false));
    const pending = deferred<{ success: true; status: number; data: typeof school }>();
    api.UPDATE_SCHOOL_SETTINGS.mockReturnValue(pending.promise);
    await user.click(save);
    await user.click(save);
    await waitFor(() => expect(save).toHaveProperty('disabled', true));
    expect(api.UPDATE_SCHOOL_SETTINGS).toHaveBeenCalledTimes(1);
    // Only the changed keys are sent.
    expect(api.UPDATE_SCHOOL_SETTINGS).toHaveBeenCalledWith({ nameAr: 'مدرسة النيل', workEnd: '14:30' });
    pending.resolve({ success: true, status: 200, data: { ...school, nameAr: 'مدرسة النيل', workEnd: '14:30' } });
    expect(await screen.findByText('تم الحفظ.')).toBeTruthy();
  });

  it('working days: unticking every day shows the error and blocks saving', async () => {
    const user = userEvent.setup();
    renderScreen();
    await field(/School name in English/);
    for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']) {
      await user.click(screen.getByRole('button', { name: day }));
    }
    expect(await screen.findByText('Choose at least one working day.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('saving the school name updates the shell immediately', async () => {
    const user = userEvent.setup();
    api.UPDATE_SCHOOL_SETTINGS.mockImplementation((changes: object) => ok({ ...school, ...changes }));
    renderScreen();
    const nameEn = await field(/School name in English/);
    expect(screen.getByTitle('Green Valley School')).toBeTruthy();

    await user.clear(nameEn);
    await user.type(nameEn, 'Nile Valley School');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTitle('Nile Valley School')).toBeTruthy();
    expect(screen.queryByTitle('Green Valley School')).toBeNull();
  });

  it('a valid logo previews, uploads and replaces the logo in the shell at once', async () => {
    const user = userEvent.setup();
    api.UPLOAD_SCHOOL_LOGO.mockImplementation(() => ok({ logoUrl: '/files/logo/new.png' }));
    renderScreen();
    await field(/School name in English/);
    expect(screen.getByTestId('shell').querySelector('img')).toBeNull();

    const logo = new File(['png'], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose a file'), logo);
    expect(screen.getByAltText('Preview of the new logo')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Upload logo' }));

    expect(await screen.findByText('Logo updated.')).toBeTruthy();
    const form = api.UPLOAD_SCHOOL_LOGO.mock.calls[0]?.[0] as FormData;
    expect((form.get('file') as File).name).toBe('logo.png');
    const shellLogo = screen.getByTestId('shell').querySelector('img');
    expect(shellLogo?.getAttribute('src')).toBe('/files/logo/new.png');
  });

  it('a logo of the wrong type or over 2 MB is refused before it is sent', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderScreen();
    await field(/School name in English/);
    const input = screen.getByLabelText('Choose a file');

    await user.upload(input, new File(['gif'], 'logo.gif', { type: 'image/gif' }));
    expect(await screen.findByText('Only PNG, JPG or SVG files can be used.')).toBeTruthy();

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await user.upload(input, big);
    expect(await screen.findByText('The file must be 2 MB or smaller.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upload logo' })).toBeNull();
    expect(api.UPLOAD_SCHOOL_LOGO).not.toHaveBeenCalled();
  });
});

describe('Settings screen — unsaved changes warning', () => {
  beforeEach(() => {
    api.GET_SCHOOL_SETTINGS_FOR_EDIT.mockImplementation(() => ok(school));
    api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
    api.GET_SCHOOL_CALENDAR.mockImplementation((year: number) => ok({ year, calendar: null }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    // A section switch writes `?section=` into the (jsdom) address bar; the next test starts clean.
    window.history.replaceState(null, '', '/');
  });

  it('switching section with edits asks first; staying keeps the edits, discarding leaves', async () => {
    const user = userEvent.setup();
    renderScreen();
    const nameEn = await field(/School name in English/);
    await user.type(nameEn, ' Annex');

    await user.click(screen.getByRole('button', { name: /HR rules/ }));
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await field(/School name in English/)).value).toBe('Green Valley School Annex');
    expect(api.GET_HR_SETTINGS).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /HR rules/ }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText('Lateness rule')).toBeTruthy();
    // The address follows on the client only: no server round trip for a section switch.
    expect(window.location.search).toBe('?section=hrRules');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('without edits a section switch needs no confirmation', async () => {
    const user = userEvent.setup();
    renderScreen();
    await field(/School name in English/);
    await user.click(screen.getByRole('button', { name: /HR rules/ }));
    expect(await screen.findByText('Lateness rule')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('following a menu link with edits asks first, then navigates on discard', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(await field(/School name in English/), ' Annex');

    await user.click(screen.getByRole('link', { name: 'Payroll link' }));
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/en/payroll'));
  });

  it('the EN / ع switch with edits asks first; staying keeps the language, discarding switches', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(await field(/School name in English/), ' Annex');

    await user.click(screen.getByRole('button', { name: 'العربية' }));
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(document.documentElement.lang).toBe('en');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'العربية' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/ar/settings', { scroll: false }));
    expect(document.documentElement.lang).toBe('ar');
  });

  it('the EN / ع switch without edits switches at once', async () => {
    const user = userEvent.setup();
    renderScreen();
    await field(/School name in English/);
    await user.click(screen.getByRole('button', { name: 'العربية' }));
    expect(router.push).toHaveBeenCalledWith('/ar/settings', { scroll: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closing the tab with edits triggers the browser prompt; without edits it does not', async () => {
    const user = userEvent.setup();
    renderScreen();
    const nameEn = await field(/School name in English/);
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(nameEn, ' Annex');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe('Settings screen — change history (owner, 2026-11-17)', () => {
  beforeEach(() => {
    api.GET_SCHOOL_SETTINGS_FOR_EDIT.mockImplementation(() => ok(school));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    // A section switch writes `?section=` into the (jsdom) address bar; the next test starts clean.
    window.history.replaceState(null, '', '/');
  });

  it('has no Change history section; "View change history" opens Activity filtered to settings', () => {
    renderScreen();
    const sections = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(sections.textContent).not.toContain('Change history');
    expect(screen.getByRole('link', { name: 'View change history' }).getAttribute('href')).toBe(
      '/en/activity?module=settings',
    );
  });

  it('the Accounting section shows only to someone who may see the accounting rules (§10)', () => {
    renderScreen();
    expect(screen.getByRole('navigation', { name: 'Settings sections' }).textContent).toContain('Accounting');
    cleanup();
    renderScreen('en', sessionWithout('accounting.settings.view'));
    expect(screen.getByRole('navigation', { name: 'Settings sections' }).textContent).not.toContain('Accounting');
  });

  it('a Stage head sees Structure and the catalogue only, and a School link opens Structure instead', async () => {
    api.GET_LIST_ITEMS.mockImplementation(() => ok([]));
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok([]));
    renderSettings(<SettingsScreen initialSection="school" />, 'en', sessionWith(...STAGE_HEAD_KEYS));
    const sections = within(screen.getByRole('navigation', { name: 'Settings sections' }));
    const buttons = sections.getAllByRole('button');
    expect(buttons.map((b) => b.querySelector('span > span')?.textContent)).toEqual(['School structure', 'Penalty catalogue']);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page');
    // The School section (core.settings.view) is never asked for: the API would refuse it.
    await waitFor(() => expect(api.GET_LIST_ITEMS).toHaveBeenCalledWith('stages', { page: 1, limit: 10 }));
    expect(api.GET_SCHOOL_SETTINGS_FOR_EDIT).not.toHaveBeenCalled();
  });

  it('with every permission: all seven sections', () => {
    renderScreen();
    expect(within(screen.getByRole('navigation', { name: 'Settings sections' })).getAllByRole('button')).toHaveLength(7);
  });

  it('the link is hidden from someone who may not read the activity log (can(), view only)', () => {
    renderScreen('en', sessionWithout('core.audit.view'));
    expect(screen.queryByRole('link', { name: 'View change history' })).toBeNull();
    cleanup();
    renderScreen('ar');
    expect(screen.getByRole('link', { name: 'عرض سجل التغييرات' }).getAttribute('href')).toBe('/ar/activity?module=settings');
  });
});
