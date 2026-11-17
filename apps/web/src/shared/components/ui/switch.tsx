'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5',
        'transition-colors duration-150 ease-snappy',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/70',
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
