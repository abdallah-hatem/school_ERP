// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace, prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({ CHANGE_OWN_PASSWORD: vi.fn() }));
vi.mock('../actions', () => ({ signOut: vi.fn() }));

import arAuth from '@school-erp/shared/locales/ar/auth.json';
import arErrors from '@school-erp/shared/locales/ar/errors.json';
import enAuth from '@school-erp/shared/locales/en/auth.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import type { MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n } from '@/test/render';
import { CHANGE_OWN_PASSWORD } from '../apis';
import { SetPasswordForm } from './SetPasswordForm';

const change = vi.mocked(CHANGE_OWN_PASSWORD);
type Res = Awaited<ReturnType<typeof CHANGE_OWN_PASSWORD>>;

function renderForm(locale: 'en' | 'ar' = 'en') {
  const messages = (locale === 'en' ? { auth: enAuth, errors: enErrors } : { auth: arAuth, errors: arErrors }) as unknown as MessageTree;
  return renderWithI18n(
    <I18nProvider messages={messages}>
      <SetPasswordForm email="rania@school.test" destination={`/${locale}/employees`} />
    </I18nProvider>,
    { locale, session: null },
  );
}

const fill = async (user: ReturnType<typeof userEvent.setup>, next: string, confirm = next) => {
  await user.type(screen.getByLabelText(/^New password/), next);
  await user.type(screen.getByLabelText(/^Confirm new password/), confirm);
};

describe('SetPasswordForm (forced, after a temporary password)', () => {
  beforeEach(() => {
    change.mockReset();
    replace.mockReset();
  });
  afterEach(cleanup);

  it('asks only for the new password (twice), sends it alone and goes on to where they were going', async () => {
    const user = userEvent.setup();
    change.mockResolvedValue({ success: true, status: 204, data: {} } as Res);
    renderForm();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
    await fill(user, 'my-own-password-1');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith({ newPassword: 'my-own-password-1' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/employees'));
  });

  it('too short or not matching: nothing is sent and the rule says why', async () => {
    const user = userEvent.setup();
    renderForm();
    await fill(user, 'short', 'short');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(screen.getByText('Use at least 10 characters.')).toBeTruthy();
    expect(change).not.toHaveBeenCalled();

    cleanup();
    renderForm();
    await fill(user, 'long-enough-pass', 'long-enough-pasX');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(screen.getByText('The two passwords are different.')).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
  });

  it('the temporary password again → SAME_PASSWORD under the field; it stays on the page', async () => {
    const user = userEvent.setup();
    change.mockResolvedValue({ success: false, status: 400, error: 'SAME_PASSWORD', message: 'x' } as Res);
    renderForm();
    await fill(user, 'temporary-1234');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('Choose a password different from the one you signed in with.')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('double submit sends one request', async () => {
    const user = userEvent.setup();
    let resolve: (r: Res) => void = () => undefined;
    change.mockReturnValue(new Promise<Res>((r) => (resolve = r)));
    renderForm();
    await fill(user, 'my-own-password-1');
    const button = screen.getByRole('button', { name: 'Save and continue' });
    await user.click(button);
    await user.click(button);
    expect(change).toHaveBeenCalledTimes(1);
    resolve({ success: true, status: 204, data: {} } as Res);
  });

  it('Arabic: the same page, mirrored, with sign-out', () => {
    renderForm('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('button', { name: 'حفظ ومتابعة' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeTruthy();
  });
});
