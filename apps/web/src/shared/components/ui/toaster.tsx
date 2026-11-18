'use client';

import { useEffect } from 'react';
import { Toaster as Sonner, toast } from 'sonner';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { buttonVariants, Spinner } from './button';
import { CheckIcon, CloseIcon, ErrorIcon, InfoIcon, WarningIcon } from './icons';

/*
 * The one toaster (DESIGN.md → Campus). Sonner places, stacks, times and swipes the toasts; the look
 * is ours: a white card with the soft border and raised shadow of every floating surface, a tone
 * icon in a soft round badge at the start, the title in the display face, a muted description, a
 * close button and actions in the app's button style. Where: never over a page header's actions
 * (owner 2026-11-18: a toast sat on "Add user"). From 600px (sonner's own phone breakpoint) the
 * bottom inline-end corner — bottom-right in English, bottom-left in Arabic — lifted clear of a
 * form's sticky Save bar; on a phone, full width just under the top bar, away from the Save bar at
 * the bottom. Motion lives in globals.css (`[data-sonner-toast]`).
 *
 * Components never call `toast.*` themselves — handleResponse does (fetch-wrapper rule).
 */

/** The tone badge's colours, keyed by the toast's type (sonner sets `data-type` on the toast). */
const badgeTone = cn(
  'group-data-[type=success]:bg-success-soft group-data-[type=success]:text-success-ink',
  'group-data-[type=error]:bg-destructive-soft group-data-[type=error]:text-destructive-ink',
  'group-data-[type=warning]:bg-warning-soft group-data-[type=warning]:text-warning-ink',
  'group-data-[type=info]:bg-primary-soft group-data-[type=info]:text-primary',
  'group-data-[type=loading]:bg-primary-soft group-data-[type=loading]:text-primary',
);

const iconClass = 'size-5';

/** Sonner lays toasts out full width below this (its own phone breakpoint). */
export const TOASTER_DESKTOP = '(min-width: 600px)';

export function Toaster() {
  const { t, dir } = useTranslation();
  const desktop = useMediaQuery(TOASTER_DESKTOP);
  useEffect(() => {
    // Smoke builds only (scripts/smoke.sh): lets e2e/23-toasts show the toast types no screen
    // raises yet (warning, info, loading, with an action). Never set for a real deployment.
    if (process.env.NEXT_PUBLIC_E2E_HOOKS !== 'true') return;
    (window as Window & { __e2eToast?: typeof toast }).__e2eToast = toast;
  }, []);
  return (
    <Sonner
      dir={dir}
      position={desktop ? (dir === 'rtl' ? 'bottom-left' : 'bottom-right') : dir === 'rtl' ? 'top-left' : 'top-right'}
      // Desktop: above the sticky Save bar (12px from the bottom, ~68px tall). Phone: below the top
      // bar (language switch, menu), never over it.
      offset={{ bottom: 96, right: 24, left: 24 }}
      mobileOffset={{ top: 72, right: 16, left: 16 }}
      // Stacked with gaps, every toast readable at once, never a collapsed pile.
      expand
      gap={10}
      visibleToasts={4}
      closeButton
      containerAriaLabel={t('ui.toast.region')}
      icons={{
        success: <CheckIcon weight="bold" className={iconClass} />,
        error: <ErrorIcon className={iconClass} />,
        warning: <WarningIcon className={iconClass} />,
        info: <InfoIcon className={iconClass} />,
        loading: <Spinner className={iconClass} />,
        close: <CloseIcon weight="bold" className="size-3.5" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: t('ui.toast.close'),
        classNames: {
          toast: cn(
            'group flex w-(--width) items-start gap-3 rounded-2xl border border-border bg-card p-3.5 pe-12',
            'font-sans text-card-foreground shadow-raised',
          ),
          icon: cn('relative grid size-9 shrink-0 place-items-center rounded-full bg-secondary', badgeTone),
          content: 'flex min-w-0 flex-1 flex-col gap-0.5 self-center py-0.5',
          title: 'font-display text-sm leading-snug font-bold text-foreground',
          description: 'text-[0.8125rem] leading-snug text-muted-foreground',
          actionButton: cn(buttonVariants({ variant: 'soft', size: 'sm' }), 'self-center'),
          cancelButton: cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-center'),
          closeButton: cn(
            'absolute end-2.5 top-2.5 grid size-8 place-items-center rounded-full text-muted-foreground',
            'transition-[background-color,color] duration-150 ease-snappy hover:bg-muted hover:text-foreground',
            'focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring/55',
          ),
        },
      }}
    />
  );
}
