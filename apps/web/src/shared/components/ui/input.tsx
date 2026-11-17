import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

/** Shared look for every text-like control: solid surface, clear border, themed focus. */
export const controlClasses = cn(
  'w-full min-w-0 rounded-lg border border-input bg-card px-3.5 text-base text-foreground shadow-xs md:text-sm',
  'placeholder:text-muted-foreground/80',
  'transition-[border-color,box-shadow] duration-150 ease-snappy outline-none',
  'focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/15 aria-invalid:focus-visible:ring-3',
);

export function Input({ className, type = 'text', onWheel, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClasses,
        'h-11',
        // No spin buttons on number fields.
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
      // The wheel must never change a focused number; blur hands the scroll back to the page.
      onWheel={(e) => {
        if (type === 'number') e.currentTarget.blur();
        onWheel?.(e);
      }}
      {...props}
    />
  );
}
