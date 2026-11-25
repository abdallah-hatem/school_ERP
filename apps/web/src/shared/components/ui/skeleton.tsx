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
 * Running text as its skeleton: the text is laid out (so it wraps onto as many lines as the loaded
 * text will) but drawn as a bar per line. Pass the text the screen usually shows, e.g. a rule
 * worded with the §7 defaults.
 */
export function SkeletonProse({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'rounded-md bg-secondary text-transparent box-decoration-clone select-none motion-safe:animate-pulse motion-safe:[animation-duration:1.8s]',
        className,
      )}
    >
      {children}
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

/**
 * A status pill's shape (`StatusPill`: text-xs with py-1 → 24px). Pass the pill's usual wording
 * (`children`) and it is laid out invisibly in the pill's own box, so the bar is as wide as the
 * loaded pill in every language; without it, a fixed `w-20` bar. `icon`: the loaded pill shows an
 * icon (size-4) instead of its dot.
 */
export function SkeletonPill({ className, children, icon = false }: { className?: string; children?: ReactNode; icon?: boolean }) {
  if (children === undefined) return <Skeleton className={cn('h-6 w-20 rounded-full', className)} />;
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        // StatusPill's box: a dot (size-1.5), gap-1.5, text-xs bold, py-1 ps-2 pe-2.5.
        'inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 ps-2 pe-2.5 text-xs font-bold whitespace-nowrap text-transparent select-none',
        'motion-safe:animate-pulse motion-safe:[animation-duration:1.8s] [&_svg]:invisible',
        className,
      )}
    >
      <span className={icon ? 'size-4' : 'size-1.5'} />
      {children}
    </span>
  );
}

/**
 * A button's shape. Without `children`: a small button (`size="sm"`: 36px) of a fixed width. With
 * them — the loaded button's icon and label — the real button's box (`size`, default `md`: 44px)
 * with that content laid out invisibly, so a header's buttons row is as wide as the loaded one in
 * every language.
 */
export function SkeletonButton({
  className,
  children,
  size = 'md',
}: {
  className?: string;
  children?: ReactNode;
  size?: 'sm' | 'md';
}) {
  if (children === undefined) return <Skeleton className={cn('h-9 w-24 rounded-lg', className)} />;
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        // Button's box: a 1px border, gap-2, bold text; `md` h-11 px-4, `sm` h-9 px-3.
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-secondary font-bold whitespace-nowrap text-transparent select-none',
        "motion-safe:animate-pulse motion-safe:[animation-duration:1.8s] [&_svg]:invisible [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
        size === 'md' ? 'h-11 px-4 text-sm' : 'h-9 px-3 text-sm',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A row of overlapping avatars (`AvatarStack`: `xs` tiles, size-7 rounded-lg, `-space-x-2`, `-my-1`
 * so they sit in the text line), `count` of them, with the text beside it when `children` is given
 * (the Roles list's "Held by").
 */
export function SkeletonAvatarStack({ count = 3, children, className }: { count?: number; children?: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex items-center gap-2', className)}>
      <span className="-my-1 flex -space-x-2">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className="size-7 shrink-0 rounded-lg ring-2 ring-card" />
        ))}
      </span>
      {children}
    </span>
  );
}

/**
 * An avatar with a name over a code (the employee cell): size-9 tile, text-sm and text-xs lines.
 * `nameClassName`: the name line's font classes when the loaded name doesn't set `text-sm` (it then
 * inherits the card's 16px on a phone).
 */
export function SkeletonIdentity({ className, nameClassName = 'text-sm' }: { className?: string; nameClassName?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex min-w-0 items-center gap-3', className)}>
      <Skeleton className="size-9 shrink-0 rounded-xl" />
      <span className="flex min-w-0 flex-1 flex-col">
        <SkeletonText className={nameClassName} width="w-28" />
        <SkeletonText className="text-xs" width="w-16" />
      </span>
    </span>
  );
}
