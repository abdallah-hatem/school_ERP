'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import styles from './error-art.module.css';

/**
 * The frame of the not-found and error screens (option 2 · "Big number, light art"): the art, then
 * the heading, one line of explanation, the way out and — for errors — the reference code, centred
 * in one column. Focus moves to the heading when it appears, so a screen reader announces where the
 * person landed; the tab's title says it too.
 */
export function StatusScreen({
  art,
  artWidth,
  title,
  body,
  actions,
  footer,
  documentTitle,
  className,
}: {
  art: ReactNode;
  /** Tailwind max-width of the art at tablet and up; phones give it the column's full width. */
  artWidth: string;
  title: string;
  body: string;
  actions: ReactNode;
  footer?: ReactNode;
  documentTitle: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  // Inside the shell the page's own metadata title ("Employees · …") comes first in <head> and
  // wins over the hoisted <title> below — and Next writes it again when the streamed metadata
  // lands — so keep the tab's title while this screen is shown.
  useEffect(() => {
    const keep = () => {
      // Gone (the next page's commit removed it): its title is the next page's business.
      if (!root.current?.isConnected) return;
      if (document.title !== documentTitle) document.title = documentTitle;
    };
    keep();
    const observer = new MutationObserver(keep);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [documentTitle]);

  return (
    <div
      ref={root}
      data-status-screen=""
      className={cn(
        'mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-1 pb-10 text-center',
        styles.rise,
        className,
      )}
    >
      <title>{documentTitle}</title>
      <div className={cn('w-full', artWidth)}>{art}</div>
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-[1.625rem] leading-tight font-extrabold text-balance outline-none sm:text-3xl"
      >
        {title}
      </h1>
      <p className="max-w-md text-[0.90625rem] text-pretty text-muted-foreground sm:text-base">{body}</p>
      <div className="mt-2 flex flex-col gap-2.5 self-stretch sm:flex-row sm:flex-wrap sm:justify-center sm:self-auto">
        {actions}
      </div>
      {footer ? <div className="mt-3 flex w-full flex-col items-center">{footer}</div> : null}
    </div>
  );
}
