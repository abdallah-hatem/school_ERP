'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { CloseIcon } from './icons';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Pick from the widest thing inside. Every size is still capped at the viewport. */
const dialogSizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
} as const;
export type DialogSize = keyof typeof dialogSizes;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-overlay',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Header and footer stay fixed; only the body scrolls. Compose as
 * `<DialogContent title footer>{body}</DialogContent>`.
 */
export function DialogContent({
  className,
  size = 'md',
  title,
  description,
  footer,
  closeLabel,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  size?: DialogSize;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  /** Accessible name of the ✕ button; omit to hide it. */
  closeLabel?: string;
}) {
  // Radix returns focus to a `DialogTrigger` only; most dialogs here open from state (a row's ⋯
  // menu, a button elsewhere), so remember what had focus and go back to it on close.
  const returnTo = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed inset-x-0 top-1/2 z-50 mx-auto flex w-full -translate-y-1/2 flex-col',
          'max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-raised',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150',
          dialogSizes[size],
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          const target = returnTo.current;
          returnTo.current = null;
          if (!event.defaultPrevented && target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
        {...props}
      >
        <div className={cn('flex shrink-0 items-start gap-3 px-6 py-5', children ? 'border-b border-border' : null)}>
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="font-display text-lg leading-snug font-extrabold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {closeLabel ? (
            <DialogPrimitive.Close
              className="-me-2 -mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={closeLabel}
            >
              <CloseIcon className="size-5" />
            </DialogPrimitive.Close>
          ) : null}
        </div>
        {children ? (
          <div className="scrollbar-clean mx-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4.5 py-5">
            {children}
          </div>
        ) : null}
        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
