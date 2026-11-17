'use client';

import { PASSWORD_MIN_LENGTH } from '@school-erp/shared';
import { useId, useState } from 'react';
import { FieldShell } from '@/shared/components/form/field-shell';
import { CheckIcon, ErrorIcon, HideIcon, PasswordIcon, ShowIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { checkNewPassword, passwordStrength, type NewPassword } from '../password-rules';

/** A password box with the lock in front and a show / hide eye at the end. */
export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  autoFocus,
  ...a11y
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: 'current-password' | 'new-password';
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <PasswordIcon className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5 text-muted-foreground" />
      <Input
        {...a11y}
        id={id}
        type={shown ? 'text' : 'password'}
        dir="ltr"
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus}
        required
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ps-11 pe-12 text-start"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t('auth.password.hide') : t('auth.password.show')}
        aria-pressed={shown}
        disabled={disabled}
        className="tap-target absolute inset-y-0 end-1.5 my-auto grid size-9 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
      >
        {shown ? <HideIcon className="size-5" /> : <ShowIcon className="size-5" />}
      </button>
    </div>
  );
}

/**
 * New password + confirmation with the live rules under them (length, match and — after a
 * temporary password — "not the temporary password", which only the API can check: `sameAsCurrent`
 * marks it broken when it said so). `showErrors` turns unmet rules into field errors (after a
 * submit attempt).
 */
export function NewPasswordFields({
  value,
  onChange,
  showErrors = false,
  temporary = false,
  sameAsCurrent = false,
  disabled,
  autoFocus,
}: {
  value: NewPassword;
  onChange: (value: NewPassword) => void;
  showErrors?: boolean;
  /** After a temporary password: show the "not the temporary password" rule. */
  temporary?: boolean;
  /** The API answered `SAME_PASSWORD`. */
  sameAsCurrent?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const nextId = useId();
  const confirmId = useId();
  const check = checkNewPassword(value);
  const strength = passwordStrength(value.next);
  const min = PASSWORD_MIN_LENGTH;

  const rules: { key: string; met: boolean; broken: boolean; text: string }[] = [
    { key: 'length', met: check.longEnough, broken: showErrors && !check.longEnough, text: t('auth.password.ruleLength', { min }) },
    ...(temporary
      ? [{ key: 'different', met: value.next.length > 0 && !sameAsCurrent, broken: sameAsCurrent, text: t('auth.password.ruleDifferent') }]
      : []),
    { key: 'match', met: check.matches, broken: showErrors && value.confirm.length > 0 && !check.matches, text: t('auth.password.ruleMatch') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FieldShell
        id={nextId}
        label={t('auth.password.new')}
        required
        error={
          sameAsCurrent
            ? 'errors.SAME_PASSWORD'
            : showErrors && !check.longEnough
              ? t('auth.password.errors.tooShort', { min })
              : undefined
        }
      >
        {(a11y) => (
          <div className="flex flex-col gap-2.5">
            <PasswordInput
              {...a11y}
              value={value.next}
              onChange={(next) => onChange({ ...value, next })}
              placeholder={t('auth.password.newPlaceholder', { min })}
              autoComplete="new-password"
              disabled={disabled}
              autoFocus={autoFocus}
            />
            <div role="meter" aria-label={t('auth.password.strength')} aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength} className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className={cn(
                    'h-1.5 rounded-full transition-colors duration-150',
                    n <= strength ? (strength <= 1 ? 'bg-warning' : 'bg-success') : 'bg-secondary',
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </FieldShell>
      <ul aria-live="polite" className="flex flex-col gap-1.5 text-xs">
        {rules.map((r) => (
          <li
            key={r.key}
            data-met={r.met || undefined}
            className={cn(
              'flex items-center gap-1.5 font-semibold',
              r.broken ? 'text-destructive-ink' : r.met ? 'text-success-ink' : 'text-muted-foreground',
            )}
          >
            {r.broken ? (
              <ErrorIcon className="size-4 shrink-0" />
            ) : (
              <CheckIcon className={cn('size-4 shrink-0', !r.met && 'opacity-40')} />
            )}
            {r.text}
          </li>
        ))}
      </ul>
      <FieldShell
        id={confirmId}
        label={t('auth.password.confirm')}
        required
        error={showErrors && value.confirm.length > 0 && !check.matches ? t('auth.password.errors.mismatch') : undefined}
      >
        {(a11y) => (
          <PasswordInput
            {...a11y}
            value={value.confirm}
            onChange={(confirm) => onChange({ ...value, confirm })}
            placeholder={t('auth.password.confirmPlaceholder')}
            autoComplete="new-password"
            disabled={disabled}
          />
        )}
      </FieldShell>
    </div>
  );
}
