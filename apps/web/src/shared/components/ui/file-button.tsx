'use client';

import { useRef, type ReactNode } from 'react';
import { Button, type ButtonProps } from './button';

/**
 * A file picker that looks like the rest of the app: a hidden native input opened by a `Button`.
 * The chosen file goes to `onFile` — or, with `multiple`, every chosen file to `onFiles`, in the
 * order picked. The input is cleared so picking the same file again still fires. No `capture`
 * attribute: on a phone an `image/*` picker offers the camera and the photos alike.
 */
export function FileButton({
  accept,
  onFile,
  onFiles,
  multiple = false,
  children,
  inputLabel,
  ...buttonProps
}: Omit<ButtonProps, 'onClick' | 'asChild'> & {
  /** `accept` of the input, e.g. `image/png,image/jpeg`. */
  accept?: string;
  onFile?: (file: File) => void;
  /** With `multiple`: all the chosen files at once. */
  onFiles?: (files: File[]) => void;
  multiple?: boolean;
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
        multiple={multiple}
        aria-label={inputLabel}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length === 0) return;
          if (onFiles) onFiles(files);
          else onFile?.(files[0]!);
        }}
      />
      <Button {...buttonProps} onClick={() => inputRef.current?.click()}>
        {children}
      </Button>
    </>
  );
}
