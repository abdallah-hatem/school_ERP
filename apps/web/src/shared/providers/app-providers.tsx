'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { dirFor, type Locale, type MessageTree } from '@/shared/lib/i18n';
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
      <Toaster
        dir={dirFor(locale)}
        position={locale === 'ar' ? 'bottom-left' : 'bottom-right'}
        toastOptions={{ className: 'font-sans' }}
      />
    </I18nProvider>
  );
}
