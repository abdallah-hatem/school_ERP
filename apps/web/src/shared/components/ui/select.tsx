'use client';

import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';
import { CheckIcon, ChevronDownIcon } from './icons';
import { controlClasses } from './input';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        controlClasses,
        'flex h-11 cursor-pointer items-center justify-between gap-2 text-start',
        'data-[placeholder]:text-muted-foreground/80 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/** Aligned to its trigger, reading-size rows, themed highlight, above every floating element. */
export function SelectContent({
  className,
  children,
  emptyText,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content> & {
  /** Shown instead of a blank strip when there is nothing to choose. */
  emptyText?: string;
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position="popper"
        sideOffset={6}
        className={cn(
          'relative z-(--z-popover) max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width)',
          'origin-(--radix-select-content-transform-origin) overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-raised',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="scrollbar-clean max-h-72 p-1.5">
          {children}
          {emptyText ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground only:block not-only:hidden">
              {emptyText}
            </p>
          ) : null}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg ps-3 pe-9 text-sm outline-none select-none',
        'data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary',
        'data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute end-3 flex size-4 items-center justify-center text-primary">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}
