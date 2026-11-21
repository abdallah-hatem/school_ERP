import { SchoolBrandingProvider } from '@/core/settings';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { SchoolBrand } from '@/core/settings/school-brand';
import { LocaleSwitch } from '@/shared/components/layout/locale-switch';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { getAuthMessages } from '../i18n';
import { safeNextPath } from '../paths';
import { LoginForm } from './LoginForm';
import { SignInIllustration } from './sign-in-illustration';
import styles from './sign-in.module.css';

/**
 * Sign-in (design/mockups/login-s2-quality.html, Q1 · Soft 3D): a light teal panel with the school's
 * logo and name (public settings, the product name as fallback), a headline and the office scene,
 * beside the form. Desktop splits the page in two (the panel at the inline start, so it mirrors in
 * Arabic); phones and tablets stack the panel — brand, language switch and the cropped art — over
 * the form.
 */
export async function LoginPage({ locale, next }: { locale: Locale; next?: string }) {
  const branding = await getSchoolBranding();
  const auth = getAuthMessages(locale);

  return (
    <I18nProvider messages={{ auth } as unknown as MessageTree}>
      <SchoolBrandingProvider initial={branding}>
        <main className="flex min-h-dvh flex-col bg-card lg:flex-row">
          <section className="relative isolate overflow-hidden bg-linear-160 from-secondary to-primary-soft px-4 pt-4 pb-1.5 sm:px-6 sm:pt-6 lg:flex lg:w-[52%] lg:flex-col lg:p-10 xl:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -end-20 -top-30 -z-10 size-70 rounded-full bg-band-2 opacity-70"
            />
            <div className="flex items-center justify-between gap-3">
              <SchoolBrand />
              <LocaleSwitch className="lg:hidden" />
            </div>
            <div className="mt-8 hidden max-w-xl lg:block">
              <p className={cn('font-display text-4xl leading-tight font-extrabold text-balance', styles.rise)}>
                {auth.login.headline}
              </p>
              <p className={cn('mt-3 text-base text-muted-foreground', styles.rise)} style={{ animationDelay: '0.1s' }}>
                {auth.login.lead}
              </p>
            </div>
            <div className="mx-auto mt-3 w-full max-w-xl overflow-hidden rounded-2xl shadow-card sm:mt-5 lg:mt-auto lg:max-w-none">
              <SignInIllustration copy={auth.login.art} rtl={locale === 'ar'} />
            </div>
          </section>

          <section className="flex flex-1 flex-col px-5 py-6 sm:px-8 lg:px-12">
            <div className="hidden justify-end lg:flex">
              <LocaleSwitch />
            </div>
            <div className="mx-auto w-full max-w-sm pt-2 lg:my-auto lg:py-8">
              <div className={styles.rise} style={{ animationDelay: '0.15s' }}>
                <h1 className="text-center font-display text-3xl font-extrabold">{auth.login.title}</h1>
                <p className="mt-2 mb-7 text-center text-sm text-balance text-muted-foreground">{auth.login.subtitle}</p>
              </div>
              <LoginForm next={safeNextPath(next) ?? undefined} />
              <p className="mt-5 text-center text-xs text-balance text-muted-foreground">{auth.login.help}</p>
            </div>
          </section>
        </main>
      </SchoolBrandingProvider>
    </I18nProvider>
  );
}
