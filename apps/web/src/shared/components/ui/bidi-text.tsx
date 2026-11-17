import type { ReactNode } from 'react';

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/;
const LATIN = /[A-Za-z]/;

/** The script a piece of user text is written in, by its letters: Arabic, Latin, or both / none. */
export function scriptOf(text: string): 'ar' | 'en' | null {
  const arabic = ARABIC.test(text);
  const latin = LATIN.test(text);
  if (arabic && !latin) return 'ar';
  if (latin && !arabic) return 'en';
  return null;
}

/**
 * Text that may be in the other script from the screen (an Arabic name in the English catalogue,
 * an English note in Arabic): isolated in a `<bdi>` with its own direction and language, so its
 * punctuation and numbers stay with it instead of jumping to the wrong end of the line.
 */
export function BidiText({
  children,
  text,
  className,
}: {
  children: ReactNode;
  /** The plain text the script is judged from, when `children` is marked up (e.g. a highlight). */
  text?: string;
  className?: string;
}) {
  const script = scriptOf(text ?? (typeof children === 'string' ? children : ''));
  return (
    <bdi
      dir={script === 'ar' ? 'rtl' : script === 'en' ? 'ltr' : 'auto'}
      lang={script ?? undefined}
      className={className}
    >
      {children}
    </bdi>
  );
}
