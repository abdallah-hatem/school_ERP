import Link from 'next/link';
import type { Locale } from '@/shared/lib/i18n';
import { GET_LOGIN_BRANDING } from '../apis';
import { getAuthMessages } from '../i18n';
import { loginPathFor, safeNextPath } from '../paths';
import { LoginForm } from './LoginForm';

interface LoginPageProps {
  locale: Locale;
  next?: string;
}

/** First letters of the school's name, for the mark when there is no logo. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Sign-in (Campus look): the school's logo and name from settings, falling back to the product
 * name when settings aren't readable yet.
 */
export async function LoginPage({ locale, next }: LoginPageProps) {
  const t = getAuthMessages(locale).login;
  const branding = await GET_LOGIN_BRANDING();
  const school = branding.success ? branding.data : undefined;
  const schoolName = (locale === 'ar' ? school?.nameAr : school?.nameEn) || t.schoolFallback;
  const logoUrl = school?.logoUrl ?? null;
  const safeNext = safeNextPath(next) ?? undefined;
  const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <main className="bg-background relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link
        href={loginPathFor(otherLocale, safeNext)}
        hrefLang={otherLocale}
        lang={otherLocale}
        className="text-muted-foreground hover:bg-card hover:text-foreground absolute end-4 top-4 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      >
        {t.switchLanguage}
      </Link>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- school logo may be SVG, served by the API via /files
            <img
              src={logoUrl}
              alt=""
              className="bg-card size-16 rounded-2xl object-contain p-1.5 shadow-sm"
            />
          ) : (
            <div
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-16 items-center justify-center rounded-2xl text-xl font-bold shadow-sm"
            >
              {initials(schoolName)}
            </div>
          )}
          <p className="text-foreground text-base font-semibold break-words">{schoolName}</p>
        </div>

        <section className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1 mb-6 text-sm">{t.subtitle}</p>
          <LoginForm locale={locale} next={safeNext} t={t} />
        </section>
      </div>
    </main>
  );
}
