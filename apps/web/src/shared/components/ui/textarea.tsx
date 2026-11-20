import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';
import { controlClasses } from './input';

/**
 * Free text (a reason, a note, an address): `dir="auto"` by default, so a Latin reason typed on the
 * Arabic screen reads left to right with its full stop at the end (dry run 2026-11-20).
 */
export function Textarea({ className, rows = 4, dir = 'auto', ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      dir={dir}
      className={cn(
        controlClasses,
        'scrollbar-clean field-sizing-content min-h-24 resize-y py-2.5 leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}
