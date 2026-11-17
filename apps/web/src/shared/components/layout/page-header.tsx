import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronEndIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';

export interface Breadcrumb {
  label: string;
  href?: string;
}

/**
 * Title row of every screen: optional breadcrumbs, the title with a status pill beside it, a
 * one-line description and the screen's actions (one primary, the rest secondary).
 * Actions wrap under the title on narrow screens.
 */
export function PageHeader({
  title,
  status,
  leading,
  description,
  breadcrumbs,
  breadcrumbsLabel,
  actions,
  className,
}: {
  title: ReactNode;
  status?: ReactNode;
  /** Shown before the title block (an employee's avatar on their profile). */
  leading?: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Accessible name of the breadcrumb nav (translated by the caller). */
  breadcrumbsLabel?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {breadcrumbs?.length ? (
        <nav aria-label={breadcrumbsLabel} className="hidden md:block">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 ? <ChevronEndIcon className="flip-rtl size-3.5" /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="rounded-sm transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
          {leading}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight break-words md:text-3xl">
                {title}
              </h1>
              {status}
            </div>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
    </header>
  );
}
