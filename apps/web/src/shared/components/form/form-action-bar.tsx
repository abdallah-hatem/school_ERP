import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * The Save / Cancel row of a page form. While `sticky`, it stays pinned to the bottom of the
 * viewport (above the phone's home indicator) so the actions are reachable from anywhere in a long
 * form without scrolling to the end. It is `sticky`, not `fixed`: inside its form it never covers
 * the last fields, and at the end of the form it settles back into place. Put it as the last direct
 * child of the `<form>`. Dialogs don't need it — their footer is already outside the scrolling body.
 */
export function FormActionBar({
  sticky = true,
  status,
  children,
  className,
}: {
  sticky?: boolean;
  /** Left-side text (unsaved changes, errors to fix, saved). */
  status?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="form-action-bar"
      data-skeleton-block="form-actions"
      data-sticky={sticky || undefined}
      className={cn(
        'flex flex-wrap items-center justify-end gap-x-3 gap-y-2',
        sticky
          ? 'sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-2xl border border-border bg-card px-4 py-3 shadow-raised'
          : 'border-t border-border pt-5',
        className,
      )}
    >
      {status !== undefined ? <div className="me-auto min-w-0 text-sm">{status}</div> : null}
      {children}
    </div>
  );
}
