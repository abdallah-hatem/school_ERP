'use client';

import { usePathname, useRouter } from 'next/navigation';
import { applyDocumentLocale } from '@/shared/lib/document-locale';
import { swapLocaleInPath, type Locale } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** Labels are the languages' own names for themselves, so they are not translated. */
const SWITCH_ORDER: readonly Locale[] = ['en', 'ar'];
const SHORT_LABEL: Record<Locale, string> = { en: 'EN', ar: 'ع' };
const FULL_NAME_KEY: Record<Locale, string> = { en: 'common.common.english', ar: 'common.common.arabic' };

/**
 * EN / ع. Switches language on the same page, without a full reload: direction and `lang` flip at
 * once, then the router swaps the locale segment (query kept, scroll kept). The choice is stored
 * in the `lang` cookie, which `apiFetch` sends as `Accept-Language`.
 */
export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(next: Locale) {
    if (next === locale) return;
    applyDocumentLocale(next);
    const target = swapLocaleInPath(pathname ?? '/', next) + window.location.search + window.location.hash;
    router.push(target, { scroll: false });
  }

  return (
    <div
      role="group"
      aria-label={t('ui.shell.language')}
      className={cn('inline-flex shrink-0 rounded-full bg-secondary p-1', className)}
    >
      {SWITCH_ORDER.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === locale}
          aria-label={t(FULL_NAME_KEY[option])}
          onClick={() => switchTo(option)}
          className={cn(
            'grid h-9 min-w-11 cursor-pointer place-items-center rounded-full px-3 text-sm font-bold transition-colors duration-150',
            option === 'ar' && 'font-display text-base leading-none',
            option === locale
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {SHORT_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
