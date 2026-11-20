import arErrors from '@school-erp/shared/locales/ar/errors.json';
import enErrors from '@school-erp/shared/locales/en/errors.json';
import { redirect } from 'next/navigation';
import { SchoolBrandingProvider } from '@/core/settings';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { SchoolBrand } from '@/core/settings/school-brand';
import { LocaleSwitch } from '@/shared/components/layout/locale-switch';
import { TemporaryPasswordIcon } from '@/shared/components/ui/icons';
import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { getAuthMessages } from '../i18n';
import { homeFor, loginPathFor, safeNextPath } from '../paths';
import { getSession } from '../session';
import { SetPasswordForm } from './SetPasswordForm';

const ERRORS = { en: enErrors, ar: arErrors } as const;

/**
 * The forced "Set a new password" page (R9, spec P3), in the sign-in page's look. Only for a user
 * who signed in with a temporary password: signed out → sign-in; nothing owed → on to `next` or
 * home. The dashboard layout sends such a user here from every screen, and the API refuses them
 * everything but this until they have chosen their own.
 */
export async function SetPasswordPage({ locale, next }: { locale: Locale; next?: string }) {
  const [user, branding] = await Promise.all([getSession(), getSchoolBranding()]);
  const destination = safeNextPath(next) ?? homeFor(locale);
  if (!user) redirect(loginPathFor(locale));
  if (!user.mustChangePassword) redirect(destination);
  const auth = getAuthMessages(locale);
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;

  return (
    <I18nProvider messages={{ auth, errors: ERRORS[locale] } as unknown as MessageTree}>
      <SchoolBrandingProvider initial={branding}>
        <main className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-16">
          {/* Same place as on the sign-in page: the top corner at the inline end. */}
          <LocaleSwitch className="absolute end-4 top-4" />
          <div className="w-full max-w-md">
            <SchoolBrand className="mb-6 justify-center" />
            <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
              <span aria-hidden="true" className="mb-4 grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning-ink">
                <TemporaryPasswordIcon className="size-6" />
              </span>
              <h1 className="font-display text-2xl font-extrabold">{auth.setPassword.title}</h1>
              <p className="mt-1 mb-6 text-sm text-muted-foreground">
                {auth.setPassword.greeting.replace('{name}', firstName)}
              </p>
              <SetPasswordForm email={user.email} destination={destination} />
            </section>
          </div>
        </main>
      </SchoolBrandingProvider>
    </I18nProvider>
  );
}
