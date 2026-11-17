import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import type { AppIcon } from './icons';
import { Skeleton, SkeletonText } from './skeleton';

/*
 * A headline figure with its label. `feature` is the one teal tile per screen that carries the
 * answer (net to pay, headcount) — sunflower appears only there.
 */
const tones = {
  primary: { tile: 'bg-linear-to-b from-primary/7 to-card to-60%', icon: 'bg-primary-soft text-primary' },
  info: { tile: 'bg-linear-to-b from-info/7 to-card to-60%', icon: 'bg-info-soft text-info' },
  warning: { tile: 'bg-linear-to-b from-warning/7 to-card to-60%', icon: 'bg-warning-soft text-warning-ink' },
  danger: { tile: 'bg-linear-to-b from-destructive/7 to-card to-60%', icon: 'bg-destructive-soft text-destructive-ink' },
  feature: { tile: 'bg-primary text-primary-foreground', icon: 'bg-primary-foreground/15 text-primary-foreground' },
} as const;
export type StatTone = keyof typeof tones;

const VALUE_TEXT = 'tabular text-xl font-extrabold tracking-tight @min-[13rem]/tile:text-[clamp(1.5rem,2.4vw,2rem)]';

export function StatTile({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  tone = 'primary',
  loading = false,
  href,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Small label before the figure, e.g. the currency. */
  unit?: ReactNode;
  sub?: ReactNode;
  icon?: AppIcon;
  tone?: StatTone;
  loading?: boolean;
  /** The whole tile links to the screen behind the figure (e.g. the filtered list). */
  href?: string;
  className?: string;
}) {
  const feature = tone === 'feature';
  const classes = cn(
    // A size container, so the figure shrinks in a half-width phone tile instead of overflowing.
    '@container/tile relative isolate flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl bg-card px-5 pt-4.5 pb-5 shadow-card',
    tones[tone].tile,
    href &&
      'cursor-pointer transition-shadow duration-150 ease-snappy hover:shadow-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
    className,
  );
  const body = (
    <>
      {feature ? (
        <>
          <span aria-hidden="true" className="absolute -end-12 -top-16 -z-10 size-36 rounded-full bg-accent/85" />
          <span aria-hidden="true" className="absolute start-[30%] -bottom-16 -z-10 size-44 rounded-full bg-primary-foreground/8" />
        </>
      ) : null}
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', tones[tone].icon)}>
            <Icon className="size-6" />
          </span>
        ) : null}
        <span className={cn('text-sm font-semibold', feature ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
          {label}
        </span>
      </div>
      {loading ? (
        // The figure's own line box (an invisible digit) with the bar over it: same height as loaded.
        <div aria-hidden="true" className="relative flex items-baseline leading-none">
          <span className={cn(VALUE_TEXT, 'invisible')}>0</span>
          <Skeleton className={cn('absolute inset-y-0 start-0 w-32', feature && 'bg-primary-foreground/20')} />
        </div>
      ) : (
        // Unit left of the figure in both languages, like <Money>; aligned to the reading start.
        <div dir="ltr" className="flex flex-wrap items-baseline gap-1.5 leading-none rtl:justify-end">
          {unit ? (
            <span className={cn('text-sm font-bold', feature ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              {unit}
            </span>
          ) : null}
          <span className={VALUE_TEXT}>{value}</span>
        </div>
      )}
      {sub ? (
        <div className={cn('-mt-1 text-xs leading-snug', feature ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
          {sub}
        </div>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} data-skeleton-block="tile" className={classes}>
      {body}
    </Link>
  ) : (
    <div data-skeleton-block="tile" className={classes}>
      {body}
    </div>
  );
}

/**
 * A tile's `sub` while it loads: `lines` bars, plus extra bars up to `narrowLines` in a narrow tile
 * (a half-width phone tile, where the loaded text wraps onto more lines).
 */
export function StatTileSubSkeleton({
  lines = 1,
  narrowLines = lines,
  gapped = false,
  feature = false,
}: {
  lines?: number;
  narrowLines?: number;
  /** The loaded sub is a wrapped list with `gap-y-1` (e.g. headcount by stage). */
  gapped?: boolean;
  feature?: boolean;
}) {
  return (
    <span className={cn('flex flex-col', gapped && 'gap-y-1')}>
      {Array.from({ length: Math.max(lines, narrowLines) }, (_, i) => (
        <SkeletonText
          key={i}
          width={i === 0 ? 'w-40' : 'w-28'}
          barClassName={feature ? 'bg-primary-foreground/20' : undefined}
          className={i >= lines ? '@min-[14rem]/tile:hidden' : undefined}
        />
      ))}
    </span>
  );
}
