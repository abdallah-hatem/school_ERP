import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';
import { controlClasses } from './input';

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        controlClasses,
        'scrollbar-clean field-sizing-content min-h-24 resize-y py-2.5 leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}
