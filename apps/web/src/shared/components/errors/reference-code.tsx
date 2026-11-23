'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

const COPIED_FOR_MS = 1800;

/**
 * The code a person quotes to support when a page fails, with Copy. The code reads left to right
 * in both languages (it is an identifier, not a word).
 */
export function ReferenceCode({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return; // No clipboard (an insecure origin, a denied permission): the code is still on screen to read out.
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
  }

  return (
    <div className="flex flex-col items-center gap-1.5" data-reference-code={code}>
      <div className="inline-flex max-w-full items-center gap-2.5 rounded-xl border border-dashed border-input bg-muted py-1.5 ps-3 pe-1.5">
        <span className="text-xs font-bold text-muted-foreground">{t('ui.errorPages.reference')}</span>
        <code dir="ltr" className="font-mono text-[0.84375rem] font-bold tracking-wider break-all">
          {code}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={t('ui.errorPages.copyLabel')}
          className={cn(
            'tap-target inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors duration-150',
            'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
            copied
              ? 'border-transparent bg-success-soft text-success-ink'
              : 'border-border bg-card text-primary hover:bg-primary-soft/60',
          )}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          <span aria-live="polite">{copied ? t('ui.errorPages.copied') : t('ui.errorPages.copy')}</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{t('ui.errorPages.referenceHelp')}</p>
    </div>
  );
}
