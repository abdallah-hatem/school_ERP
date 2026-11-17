'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form } from '@/shared/components/form/form';
import { TextField } from '@/shared/components/form/fields';
import { Button } from '@/shared/components/ui/button';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { signIn, signInWithForm } from '../actions';

/** Messages are translation keys, so the same schema serves both languages. */
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'ui.form.required')
    .pipe(z.email('auth.login.errors.invalidEmail')),
  password: z.string().min(1, 'ui.form.required'),
});
type LoginValues = z.infer<typeof loginSchema>;

/**
 * Email + password. The button is busy and disabled while signing in, so two clicks send one
 * request; a failed attempt keeps what was typed and shows the API's translated message.
 */
export function LoginForm({ next }: { next?: string }) {
  const { t, locale } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (values: LoginValues) => {
    setError(null);
    startTransition(async () => {
      const res = await signIn({ ...values, locale, next });
      setError(res.error || t('auth.login.errorFallback'));
    });
  };

  return (
    // `action` only runs if the form is posted before hydration; once hydrated, onSubmit takes over.
    <Form action={signInWithForm} onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TextField
        control={form.control}
        name="email"
        type="email"
        dir="ltr"
        inputMode="email"
        autoComplete="username"
        label={t('auth.login.email')}
        placeholder={t('auth.login.emailPlaceholder')}
        disabled={pending}
        required
      />
      <TextField
        control={form.control}
        name="password"
        type="password"
        autoComplete="current-password"
        label={t('auth.login.password')}
        placeholder={t('auth.login.passwordPlaceholder')}
        disabled={pending}
        required
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive-ink"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {pending ? t('auth.login.submitting') : t('auth.login.submit')}
      </Button>
    </Form>
  );
}
