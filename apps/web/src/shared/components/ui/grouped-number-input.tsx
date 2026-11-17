'use client';

import { useLayoutEffect, useReducer, useRef, type ComponentProps } from 'react';
import { deleteAcrossComma, groupedEdit } from '@/shared/lib/grouped-number';
import { cn } from '@/shared/lib/utils';
import { Input } from './input';

type GroupedNumberInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  /** The text shown, already grouped (`"30,000"`). The parent turns it into a number. */
  value: string;
  onValueChange: (text: string) => void;
  /** Decimal places that may be typed (0 = whole numbers). */
  decimals?: number;
  allowNegative?: boolean;
};

/**
 * A text input for a figure that groups thousands while the person types (`30000` → `30,000`),
 * keeping the caret by digit count, ignoring letters and rejecting keystrokes that could never be
 * valid. Latin digits and left-to-right in both languages. Clicking into it selects the whole
 * figure, so typing replaces it; a second click places the caret.
 */
export function GroupedNumberInput({
  value,
  onValueChange,
  decimals = 0,
  allowNegative = false,
  ref,
  onKeyDown,
  onFocus,
  onMouseDown,
  onMouseUp,
  className,
  ...props
}: GroupedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  // Set by the click that focuses the field, so its mouseup doesn't drop the selection.
  const keepSelectionOnMouseUp = useRef(false);
  // Re-render even when the text is unchanged (an ignored letter), so React puts the value back
  // and the caret is restored rather than left at the end.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const options = { decimals, allowNegative };

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (pendingCaret.current === null || !el) return;
    if (el.ownerDocument.activeElement === el) el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  function apply(next: string, caret: number, previousCaret: number) {
    const edit = groupedEdit(next, caret, options);
    if (edit) {
      pendingCaret.current = edit.caret;
      if (edit.text !== value) onValueChange(edit.text);
    } else {
      pendingCaret.current = previousCaret;
    }
    rerender();
  }

  return (
    <Input
      {...props}
      ref={(el) => {
        inputRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as { current: HTMLInputElement | null }).current = el;
      }}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      dir="ltr"
      className={cn('tabular text-start rtl:text-end', className)}
      value={value}
      onFocus={(e) => {
        onFocus?.(e);
        e.currentTarget.select();
      }}
      onMouseDown={(e) => {
        onMouseDown?.(e);
        keepSelectionOnMouseUp.current = e.currentTarget.ownerDocument.activeElement !== e.currentTarget;
      }}
      onMouseUp={(e) => {
        onMouseUp?.(e);
        if (!keepSelectionOnMouseUp.current) return;
        keepSelectionOnMouseUp.current = false;
        e.preventDefault();
        e.currentTarget.select();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        // A caret restore only ever belongs to the edit that queued it; any new key starts clean.
        pendingCaret.current = null;
        const el = e.currentTarget;
        const across = deleteAcrossComma(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0, e.key);
        if (!across) return;
        e.preventDefault();
        apply(across.value, across.caret, el.selectionStart ?? 0);
      }}
      onChange={(e) => {
        const el = e.target;
        const caret = el.selectionStart ?? el.value.length;
        // Where the caret was before this keystroke, for a rejected edit.
        const previousCaret = Math.max(0, caret - (el.value.length - value.length));
        apply(el.value, caret, previousCaret);
      }}
    />
  );
}
