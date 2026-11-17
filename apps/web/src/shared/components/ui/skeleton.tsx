import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

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
