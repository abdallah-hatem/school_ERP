'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { CheckIcon, CopyIcon, RecalculateIcon, TemporaryPasswordIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * A temporary password on its warm card (Add user, Set temporary password): the password in a
 * monospace box with Copy and "Another one", and the line saying it is shown only once.
 */
export function TempPasswordBox({
  password,
  onRegenerate,
  name,
  disabled = false,
  className,
}: {
  password: string;
  onRegenerate: () => void;
  /** Whose it is (the "must choose their own" line), when known. */
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  // Which password was copied: a new one is not.
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const copied = copiedFor === password;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopiedFor(password);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedFor(null), 2000);
    } catch {
      setCopiedFor(null);
    }
  }

  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl bg-warning-soft p-4 text-warning-ink', className)}>
      <p className="flex items-center gap-2 text-sm font-bold">
        <TemporaryPasswordIcon className="size-5 shrink-0" />
        {t('access.tempPassword.label')}
      </p>
      <div className="flex items-center gap-1 rounded-xl border border-dashed border-warning/60 bg-card ps-3.5 pe-1 py-1 text-foreground">
        <output
          data-testid="temp-password"
          dir="ltr"
          className="min-w-0 flex-1 font-mono text-[0.95rem] font-bold tracking-wide break-all select-all"
        >
          {password}
        </output>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="tap-target"
          aria-label={copied ? t('access.tempPassword.copied') : t('access.tempPassword.copy')}
          title={copied ? t('access.tempPassword.copied') : t('access.tempPassword.copy')}
          onClick={() => void copy()}
          disabled={disabled}
        >
          {copied ? <CheckIcon className="size-4.5 text-success" /> : <CopyIcon className="size-4.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="tap-target"
          aria-label={t('access.tempPassword.regenerate')}
          title={t('access.tempPassword.regenerate')}
          onClick={onRegenerate}
          disabled={disabled}
        >
          <RecalculateIcon className="size-4.5" />
        </Button>
      </div>
      <p className="text-xs leading-relaxed">
        {name ? t('access.tempPassword.shownOnce', { name }) : t('access.tempPassword.shownOnceNoName')}
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('access.tempPassword.copied') : ''}
      </span>
    </div>
  );
}
