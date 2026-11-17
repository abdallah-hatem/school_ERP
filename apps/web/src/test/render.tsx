import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { getBaseMessages, type Locale } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';

/** Render inside the real translations for `locale` (default English), with `dir` set like the app. */
export function renderWithI18n(ui: ReactElement, { locale = 'en', ...options }: RenderOptions & { locale?: Locale } = {}) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider locale={locale} messages={getBaseMessages(locale)}>
        {children}
      </I18nProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
