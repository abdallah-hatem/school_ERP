'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * A switch. `pending` is the moment between a flip and its save: the new value shows, the track
 * dims while the thumb keeps its full shape, and the switch can't be flipped again — but it stays
 * focusable (not `disabled`, which would also look like a locked switch and drop the focus).
 * No spinner (DESIGN.md → States: spinners only in a submitting button and a refetching search).
 */
export function Switch({
  className,
  pending = false,
  onClick,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root> & { pending?: boolean }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-pending={pending ? '' : undefined}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        onClick?.(event);
        // Radix skips its toggle when the click is prevented.
        if (pending) event.preventDefault();
      }}
      className={cn(
        'peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5',
        'transition-colors duration-150 ease-snappy',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/70',
        'data-pending:cursor-progress data-pending:data-[state=checked]:bg-primary/50 data-pending:data-[state=unchecked]:bg-muted-foreground/35',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
        'disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-6 rounded-full bg-card shadow-card',
          'transition-transform duration-150 ease-snappy',
          'data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-5',
          'rtl:data-[state=checked]:-translate-x-5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
