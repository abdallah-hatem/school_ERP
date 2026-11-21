import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-bold whitespace-nowrap select-none',
    'transition-[background-color,box-shadow,transform,color] duration-150 ease-snappy',
    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 aria-disabled:opacity-55',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover',
        secondary: 'border border-border bg-card text-foreground shadow-xs hover:bg-muted hover:shadow-card',
        soft: 'bg-primary-soft text-primary hover:bg-primary-soft/70',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-destructive/50',
        /** Takes something away but isn't the dialog's final say (Deactivate on a header). */
        'destructive-outline':
          'border border-destructive/30 bg-card text-destructive-ink shadow-xs hover:border-destructive/45 hover:bg-destructive-soft focus-visible:outline-destructive/50',
        /** Gives something back (Reactivate): a soft success tone. */
        'success-soft':
          'border border-success/25 bg-success-soft text-success-ink hover:border-success/45 hover:bg-success-soft/70 focus-visible:outline-success/50',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        icon: 'size-11 text-lg',
        'icon-sm': 'size-9 text-base',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Mid-submit: shows a spinner and disables the button so it can't fire twice. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  type,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant ?? 'secondary'}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      data-slot="button"
      data-variant={variant ?? 'secondary'}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/**
 * The app's spinner: inside a button that is mid-submit, a loading toast's badge, and in place of
 * a list's search magnifier while the list refetches (`SearchInput loading`).
 */
export function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} className={cn('size-4 animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
