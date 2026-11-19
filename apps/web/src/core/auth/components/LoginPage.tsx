import { SchoolBrandingProvider } from '@/core/settings';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { SchoolBrand } from '@/core/settings/school-brand';
import { LocaleSwitch } from '@/shared/components/layout/locale-switch';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { getAuthMessages } from '../i18n';
import { safeNextPath } from '../paths';
import { LoginForm } from './LoginForm';

/**
 * Sign-in (Campus look): the school's logo and name from the public settings endpoint, falling
 * back to the product name when they can't be read.
 */
export async function LoginPage({ locale, next }: { locale: Locale; next?: string }) {
  const branding = await getSchoolBranding();
  const auth = getAuthMessages(locale);

  return (
    <I18nProvider messages={{ auth } as unknown as MessageTree}>
      <SchoolBrandingProvider initial={branding}>
        <main className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-16">
          <LocaleSwitch className="absolute end-4 top-4" />
          <div className="w-full max-w-sm">
            <SchoolBrand className="mb-6 justify-center" />
            <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
              <h1 className="font-display text-2xl font-extrabold">{auth.login.title}</h1>
              <p className="mt-1 mb-6 text-sm text-muted-foreground">{auth.login.subtitle}</p>
              <LoginForm next={safeNextPath(next) ?? undefined} />
            </section>
          </div>
        </main>
      </SchoolBrandingProvider>
    </I18nProvider>
  );
}
