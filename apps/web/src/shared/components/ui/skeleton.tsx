import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** A tracing of the real component: same height, gap and rounding as what replaces it. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'rounded-md bg-secondary motion-safe:animate-pulse motion-safe:[animation-duration:1.8s]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * One line of text in its real line box: pass the text's font classes (`text-sm`, `font-display
 * text-2xl`…) so the line height — and so the block's height — is the loaded text's; the bar is
 * `width` wide. Use it instead of a fixed `h-4` guess wherever a skeleton stands in for text.
 */
export function SkeletonText({ className, width = 'w-24', barClassName }: { className?: string; width?: string; barClassName?: string }) {
  return (
    <span data-slot="skeleton" aria-hidden="true" className={cn('block min-w-0', className)}>
      <span
        className={cn(
          'inline-block h-[0.8em] max-w-full rounded-md bg-secondary align-middle motion-safe:animate-pulse motion-safe:[animation-duration:1.8s]',
          width,
          barClassName,
        )}
      />
    </span>
  );
}

/**
 * A form as its own skeleton: the real form (rendered with placeholder values, e.g. the §7
 * defaults) keeps its exact layout and labels while every control is a pulsing block and nothing
 * can be used. For forms, where hand-drawn bars would never line up with the fields.
 */
export function SkeletonMask({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className={className}>
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      <div aria-hidden="true" inert className="skeleton-mask">
        {children}
      </div>
    </div>
  );
}

/** A status pill's shape (`StatusPill`: text-xs with py-1 → 24px). */
export function SkeletonPill({ className }: { className?: string }) {
  return <Skeleton className={cn('h-6 w-20 rounded-full', className)} />;
}

/** A small button's shape (`size="sm"`: 36px). */
export function SkeletonButton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-9 w-24 rounded-lg', className)} />;
}

/** An avatar with a name over a code (the employee cell): size-9 tile, text-sm and text-xs lines. */
export function SkeletonIdentity({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex min-w-0 items-center gap-3', className)}>
      <Skeleton className="size-9 shrink-0 rounded-xl" />
      <span className="flex min-w-0 flex-1 flex-col">
        <SkeletonText className="text-sm" width="w-28" />
        <SkeletonText className="text-xs" width="w-16" />
      </span>
    </span>
  );
}
