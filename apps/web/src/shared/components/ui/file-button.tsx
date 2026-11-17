'use client';

import { useRef, type ReactNode } from 'react';
import { Button, type ButtonProps } from './button';

/**
 * A file picker that looks like the rest of the app: a hidden native input opened by a `Button`.
 * The chosen file goes to `onFile`; the input is cleared so picking the same file again still fires.
 */
export function FileButton({
  accept,
  onFile,
  children,
  inputLabel,
  ...buttonProps
}: Omit<ButtonProps, 'onClick' | 'asChild'> & {
  /** `accept` of the input, e.g. `image/png,image/jpeg`. */
  accept?: string;
  onFile: (file: File) => void;
  /** Accessible name of the hidden input (for tests and assistive tech). */
  inputLabel: string;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={inputLabel}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <Button {...buttonProps} onClick={() => inputRef.current?.click()}>
        {children}
      </Button>
    </>
  );
}
