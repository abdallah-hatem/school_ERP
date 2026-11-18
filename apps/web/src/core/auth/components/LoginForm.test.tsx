// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { renderWithI18n } from '@/test/render';
import { getAuthMessages } from '../i18n';
import { LoginForm } from './LoginForm';

const signIn = vi.hoisted(() => vi.fn());
const signInWithForm = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ signIn, signInWithForm }));

function renderForm(locale: 'en' | 'ar' = 'en') {
  return renderWithI18n(
    <I18nProvider messages={{ auth: getAuthMessages(locale) } as unknown as MessageTree}>
      <LoginForm next="/en/payroll" />
    </I18nProvider>,
    { locale },
  );
}

describe('LoginForm', () => {
  afterEach(() => {
    cleanup();
    signIn.mockReset();
  });

  it('blocks submit with translated inline errors (Arabic)', async () => {
    const user = userEvent.setup();
    renderForm('ar');
    await user.type(screen.getByRole('textbox', { name: /البريد/ }), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    expect(await screen.findByText('أدخل بريدًا إلكترونيًا مثل name@school.edu.eg.')).toBeTruthy();
    expect(screen.getByText('هذا الحقل مطلوب.')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    expect(signInWithForm).not.toHaveBeenCalled();
  });

  it('two clicks send one request, then the API message shows and the email is kept', async () => {
    let resolve: (v: { error: string }) => void = () => {};
    signIn.mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderForm();
    const email = screen.getByRole('textbox', { name: /Email/ });
    await user.type(email, 'admin@school.local');
    await user.type(screen.getByLabelText(/Password/), 'wrong');
    const button = screen.getByRole('button', { name: 'Sign in' });
    await user.click(button);
    await user.click(button);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith({
      email: 'admin@school.local',
      password: 'wrong',
      locale: 'en',
      next: '/en/payroll',
    });

    resolve({ error: 'Email or password is incorrect.' });
    expect((await screen.findByRole('alert')).textContent).toBe('Email or password is incorrect.');
    expect((email as HTMLInputElement).value).toBe('admin@school.local');
    // Once hydrated, the no-JS fallback action never runs.
    expect(signInWithForm).not.toHaveBeenCalled();
  });

  it('a locked account: the lockout message shows, worded by the API in the page language', async () => {
    // The API answers 429 TOO_MANY_ATTEMPTS with its message in the page's language and plural form.
    signIn.mockResolvedValue({ error: 'محاولات كثيرة جدًا. حاول مرة أخرى بعد 15 دقيقة.' });
    const user = userEvent.setup();
    renderForm('ar');
    await user.type(screen.getByRole('textbox', { name: /البريد/ }), 'admin@school.local');
    await user.type(screen.getByLabelText(/كلمة المرور/), 'right-password');
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'محاولات كثيرة جدًا. حاول مرة أخرى بعد 15 دقيقة.',
    );
    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ locale: 'ar' }));
  });
});
