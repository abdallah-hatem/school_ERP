'use client';

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

/** The kit's radio group (never the browser's): a column of choices, one picked. */
export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('flex flex-col gap-2', className)} {...props} />;
}

/** One choice: a round mark that fills teal with a dot when picked. */
export function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border border-input bg-card shadow-xs',
        'transition-colors duration-150 ease-snappy',
        'data-[state=checked]:border-primary',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-primary" />
    </RadioGroupPrimitive.Item>
  );
}
