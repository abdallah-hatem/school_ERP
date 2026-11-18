'use client';

import Image from 'next/image';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { useSchoolBranding } from './branding-provider';

/** Generic mark (sun over water) used until the school uploads a logo. */
function FallbackMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <rect width="40" height="40" rx="12" className="fill-primary" />
      <circle cx="20" cy="17" r="7" className="fill-accent" />
      <path d="M6 26c4.5-3 9.5-3 14 0s9.5 3 14 0v8H6z" className="fill-primary-foreground" />
      <path d="M6 31c4.5-3 9.5-3 14 0s9.5 3 14 0" className="fill-none stroke-primary-soft" strokeWidth="1.5" />
    </svg>
  );
}

/** The school's logo and name in the current language; the product name underneath. */
export function SchoolBrand({
  collapse = 'never',
  className,
}: {
  /** `below-xl`: the icon rail shows only the mark (the name stays for screen readers). */
  collapse?: 'never' | 'below-xl';
  className?: string;
}) {
  const { locale, t } = useTranslation();
  const { branding } = useSchoolBranding();
  const name = locale === 'ar' ? branding.nameAr : branding.nameEn;
  const productName = t('ui.shell.productName');

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {branding.logoUrl ? (
        <Image
          src={branding.logoUrl}
          alt=""
          width={44}
          height={44}
          unoptimized
          className="size-11 shrink-0 rounded-xl bg-card object-contain"
        />
      ) : (
        <FallbackMark className="size-11 shrink-0" />
      )}
      <div className={cn('min-w-0 flex-1', collapse === 'below-xl' && 'max-xl:sr-only')}>
        {/* Up to two lines, never an ellipsis on a name that fits in two (long Arabic names). */}
        <p className="font-display line-clamp-2 text-base leading-tight font-extrabold break-words text-balance" title={name}>
          {name}
        </p>
        {name !== productName ? <p className="truncate text-xs text-muted-foreground">{productName}</p> : null}
      </div>
    </div>
  );
}
