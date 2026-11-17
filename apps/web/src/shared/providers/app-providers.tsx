'use client';

import type { ReactNode } from 'react';
import { Toaster } from '@/shared/components/ui/toaster';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from './i18n-provider';

/** Everything every page needs on the client: translations and the toaster. */
export function AppProviders({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: MessageTree;
  children: ReactNode;
}) {
  return (
    <I18nProvider locale={locale} messages={messages}>
      {children}
      <Toaster />
    </I18nProvider>
  );
}
