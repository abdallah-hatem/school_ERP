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
  keepTitleLine = false,
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
  /**
   * The title (and its status) keeps one line whenever the row is wide enough for it alone: the
   * actions wrap under the title instead of squeezing it to two lines (a long title beside many
   * buttons — Approved payroll · November 2026, dry run 2026-11-20). On a phone it still wraps.
   */
  keepTitleLine?: boolean;
  className?: string;
}) {
  return (
    <header data-skeleton-block="header" className={cn('flex flex-col gap-3', className)}>
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
        <div
          data-keep-title-line={keepTitleLine ? '' : undefined}
          // Its basis is the title row's own width (the description below adds none: `w-0 min-w-full`),
          // so when title + actions don't fit, the actions take the next line.
          className={cn('flex min-w-0 items-center gap-4', keepTitleLine ? 'flex-[1_1_auto]' : 'flex-1 basis-64')}
        >
          {leading}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight break-words md:text-3xl">
                {title}
              </h1>
              {status}
            </div>
            {description ? (
              <p className={cn('text-sm text-muted-foreground', keepTitleLine && 'w-0 min-w-full')}>{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
    </header>
  );
}
