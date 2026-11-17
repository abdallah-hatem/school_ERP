import type { ReactNode } from 'react';

/**
 * Stands for one value inside a translated sentence — `t('key', { name: TEXT_SLOT })` — so that
 * value can be drawn as an element (a link, an isolated name) where the sentence puts it.
 */
export const TEXT_SLOT = '\u0000';

/** `text` (translated with `TEXT_SLOT` for one value) with `slot` drawn where the value goes. */
export function SlotText({ text, slot }: { text: string; slot: ReactNode }) {
  const [before = '', after] = text.split(TEXT_SLOT);
  if (after === undefined) return <>{before}</>;
  return (
    <>
      {before}
      {slot}
      {after}
    </>
  );
}
