'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

/**
 * Grows from its trigger, capped to the space available, above every floating element. It keeps
 * 16px from the screen edge (the page gutter) when it shifts or flips to fit.
 */
export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-(--z-popover) max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-2rem)]',
          'origin-(--radix-popover-content-transform-origin) rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-raised outline-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
