import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Every form goes through this: `noValidate` turns off the browser's bubbles so the zod schema's
 * translated inline errors are the only ones shown (with `required` still on the inputs for
 * assistive tech).
 */
export function Form({ className, ...props }: ComponentProps<'form'>) {
  return <form noValidate className={cn('flex flex-col gap-5', className)} {...props} />;
}
