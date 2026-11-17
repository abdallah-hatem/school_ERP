'use client';

import { Direction } from 'radix-ui';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createTranslator,
  dirFor,
  hasMessage,
  mergeMessages,
  type Locale,
  type MessageTree,
  type Translate,
} from '@/shared/lib/i18n';

interface I18nValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  messages: MessageTree;
  t: Translate;
  /** True when `key` is a message — lets form errors carry either a key or ready text. */
  has: (key: string) => boolean;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Client-side translations. The root layout provides `common` + `ui`; a module page nests another
 * provider with its own namespace (`<I18nProvider messages={{ hr }}>`), merged on top.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale?: Locale;
  messages: MessageTree;
  children: ReactNode;
}) {
  const parent = useContext(I18nContext);
  const value = useMemo<I18nValue>(() => {
    const resolvedLocale = locale ?? parent?.locale ?? 'ar';
    const merged = parent ? mergeMessages(parent.messages, messages) : messages;
    return {
      locale: resolvedLocale,
      dir: dirFor(resolvedLocale),
      messages: merged,
      t: createTranslator(merged),
      has: (key) => hasMessage(merged, key),
    };
  }, [locale, messages, parent]);

  // Radix primitives (select, popover, …) default to LTR; they follow the page's direction instead.
  return (
    <I18nContext.Provider value={value}>
      <Direction.DirectionProvider dir={value.dir}>{children}</Direction.DirectionProvider>
    </I18nContext.Provider>
  );
}

export function useTranslation(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useTranslation must be used inside <I18nProvider>');
  return value;
}
