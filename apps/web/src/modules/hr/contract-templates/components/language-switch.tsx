'use client';

import type { ContractLanguage } from '@school-erp/shared';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * A document's language, Arabic / English, each named in its own language (mockup A). `available`
 * leaves English out when a template has no English text (edge case 9).
 */
export function LanguageSwitch({
  value,
  onChange,
  available = ['AR', 'EN'],
  label,
  size = 'md',
  className,
}: {
  value: ContractLanguage;
  onChange: (language: ContractLanguage) => void;
  available?: readonly ContractLanguage[];
  /** The group's accessible name; default "Document language". */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={label ?? t('contractTemplates.editor.documentLanguage')}
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-xl bg-secondary p-1', className)}
    >
      {(['AR', 'EN'] as const)
        .filter((l) => available.includes(l))
        .map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={value === l}
            lang={l === 'AR' ? 'ar' : 'en'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(l)}
            className={cn(
              'cursor-pointer rounded-lg font-semibold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-ring/55',
              size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
              value === l ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`contractTemplates.nativeLanguages.${l}`)}
          </button>
        ))}
    </div>
  );
}
