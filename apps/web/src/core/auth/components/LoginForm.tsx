'use client';

import { useActionState } from 'react';
import type { Locale } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { signIn, type SignInState } from '../actions';
import type { AuthMessages } from '../i18n';

const INITIAL: SignInState = { error: null };

const fieldClass = cn(
  'border-input bg-card text-foreground h-11 w-full rounded-lg border px-3 text-base md:text-sm',
  'placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-150',
  'focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-3 focus-visible:outline-none',
  'aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60',
);

interface LoginFormProps {
  locale: Locale;
  next?: string;
  t: AuthMessages['login'];
}

/** Email + password. Disabled while signing in, so two clicks send one request. */
export function LoginForm({ locale, next, t }: LoginFormProps) {
  const [state, action, pending] = useActionState(signIn, INITIAL);
  const error = state.error === null ? null : state.error || t.errorFallback;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate={false}>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          {t.email}
          <span aria-hidden="true" className="text-destructive ms-0.5">
            *
          </span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          required
          autoComplete="username"
          inputMode="email"
          defaultValue={state.email}
          placeholder={t.emailPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          disabled={pending}
          className={cn(fieldClass, 'text-start rtl:text-end')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          {t.password}
          <span aria-hidden="true" className="text-destructive ms-0.5">
            *
          </span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder={t.passwordPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          disabled={pending}
          className={fieldClass}
        />
      </div>

      {error ? (
        <p
          id="login-error"
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={cn(
          'bg-primary text-primary-foreground inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold',
          'cursor-pointer transition-[opacity,transform] duration-150 active:scale-[0.98]',
          'focus-visible:ring-primary/30 focus-visible:ring-3 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-70',
        )}
      >
        {pending ? (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-e-transparent motion-reduce:animate-none"
          />
        ) : null}
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
