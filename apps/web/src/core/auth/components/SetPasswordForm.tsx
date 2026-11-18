'use client';

import { ErrorCode } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { callApi } from '@/lib/callApi';
import { Button } from '@/shared/components/ui/button';
import { ChevronEndIcon, ErrorIcon, SignOutIcon } from '@/shared/components/ui/icons';
import { apiErrorText } from '@/shared/lib/api-error';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { signOut } from '../actions';
import { CHANGE_OWN_PASSWORD } from '../apis';
import { checkNewPassword, type NewPassword } from '../password-rules';
import { NewPasswordFields } from './password-fields';

/**
 * The forced "Set a new password" form (R9, spec P3): only the new password and its confirmation —
 * signing in with the temporary one just proved it. On success the user goes on to `next` (where
 * they were going) or home; the API refused everything else until now.
 */
export function SetPasswordForm({ email, destination }: { email: string; destination: string }) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState<NewPassword>({ next: '', confirm: '' });
  const [tried, setTried] = useState(false);
  const [sameAsCurrent, setSameAsCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (inFlight.current || !checkNewPassword(value).ok) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let done = false;
    try {
      const res = await callApi(CHANGE_OWN_PASSWORD({ newPassword: value.next }), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('auth.setPassword.saved'),
      });
      if (res.unauthorized) return;
      if (res.success) {
        done = true;
        router.replace(destination);
        router.refresh();
        return;
      }
      if (res.error === ErrorCode.SAME_PASSWORD) {
        setSameAsCurrent(true);
        return;
      }
      // Locked by too many wrong passwords: "Try again in N minutes" (the API's `params.count`).
      setError(apiErrorText(res, { t, has }) || t('auth.password.failed'));
    } finally {
      if (!done) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" aria-label={t('auth.setPassword.title')}>
        <NewPasswordFields
          value={value}
          onChange={(next) => {
            setValue(next);
            if (next.next !== value.next) setSameAsCurrent(false);
          }}
          showErrors={tried}
          temporary
          sameAsCurrent={sameAsCurrent}
          disabled={busy}
          autoFocus
        />
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm font-semibold text-destructive-ink">
            <ErrorIcon className="mt-0.5 size-4.5 shrink-0" />
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
          {busy ? null : <ChevronEndIcon className="flip-rtl" />}
          {t('auth.setPassword.submit')}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <bdi dir="ltr" className="min-w-0 truncate">
          {email}
        </bdi>
        <form action={signOut.bind(null, locale)}>
          <button
            type="submit"
            className="tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-bold text-primary hover:underline"
          >
            <SignOutIcon className="flip-rtl size-4" />
            {t('auth.setPassword.signOut')}
          </button>
        </form>
      </div>
    </div>
  );
}
