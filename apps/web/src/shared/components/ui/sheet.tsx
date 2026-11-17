'use client';

import { Dialog as SheetPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { DialogOverlay } from './dialog';

/*
 * A panel that slides in from an edge. Built on the Dialog primitive, so Esc, the backdrop and
 * focus return to the trigger come for free. `side="start"` is the inline-start edge: left in
 * English, right in Arabic — the slide direction flips with it.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;

const sides = {
  start: cn(
    'inset-y-0 start-0 h-dvh w-[min(20rem,86vw)] border-e',
    'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
    'rtl:data-[state=open]:slide-in-from-right rtl:data-[state=closed]:slide-out-to-right',
  ),
  end: cn(
    'inset-y-0 end-0 h-dvh w-[min(28rem,92vw)] border-s',
    'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
    'rtl:data-[state=open]:slide-in-from-left rtl:data-[state=closed]:slide-out-to-left',
  ),
  bottom: cn(
    'inset-x-0 bottom-0 max-h-[calc(100dvh-2rem)] rounded-t-2xl border-t',
    'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
  ),
} as const;

export function SheetContent({
  className,
  side = 'start',
  label,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sides;
  /** Accessible name when the sheet has no visible <SheetTitle>. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <SheetPrimitive.Portal>
      <DialogOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        aria-describedby={undefined}
        className={cn(
          'fixed z-50 flex flex-col border-border bg-card shadow-raised',
          'ease-drawer data-[state=open]:animate-in data-[state=open]:duration-250',
          'data-[state=closed]:animate-out data-[state=closed]:duration-150',
          sides[side],
          className,
        )}
        {...props}
      >
        {label ? <SheetPrimitive.Title className="sr-only">{label}</SheetPrimitive.Title> : null}
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
