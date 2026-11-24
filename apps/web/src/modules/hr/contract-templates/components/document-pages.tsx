'use client';

import { CONTRACT_DOCUMENT_CSS } from '@school-erp/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CONTENT_WIDTH_PX, paginateArticle, PAGE_WIDTH_PX } from '../lib/paginate';

/*
 * A rendered contract as A4 pages (spec → One renderer): the HTML comes from the shared
 * `renderContractDocument` and is styled by the shared `CONTRACT_DOCUMENT_CSS` — the same function
 * and CSS the API's PDF uses, so the preview is the PDF. The renderer escapes every text and puts
 * classes only (no inline styles: the page's CSP), so injecting it is safe.
 */

/** The shared print CSS, once per page (React hoists and dedupes a `<style href>`). */
export function ContractDocumentStyles() {
  return (
    <style href="contract-document-css" precedence="default">
      {CONTRACT_DOCUMENT_CSS}
    </style>
  );
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** `<article class="cd-doc" dir lang>` → its opening tag, to wrap each page's part in. */
function articleOpen(html: string): string {
  return /^<article[^>]*>/.exec(html)?.[0] ?? '<article class="cd-doc">';
}

export interface DocumentPagesProps {
  /** `renderContractDocument(…).html`. */
  html: string;
  /** 1 = 100 %. Ignored with `fit`. */
  zoom?: number;
  /** Scale the pages to the container's width (a phone), never above 100 %. */
  fit?: boolean;
  /** The page count once laid out (`null` while measuring). */
  onPages?: (count: number) => void;
  /** The page in view changed (1-based). */
  onPageInView?: (page: number) => void;
  /** Dimmed while a new preview loads. */
  dimmed?: boolean;
  className?: string;
}

/**
 * Lays the document out at the A4 text width (hidden), cuts it into pages block by block, and draws
 * each page on a white A4 sheet with 20 mm margins.
 */
export function DocumentPages({ html, zoom = 1, fit = false, onPages, onPageInView, dimmed = false, className }: DocumentPagesProps) {
  const { t } = useTranslation();
  const measureRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[] | null>(null);
  const [fonts, setFonts] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const onPagesRef = useRef(onPages);
  const onPageInViewRef = useRef(onPageInView);
  useEffect(() => {
    onPagesRef.current = onPages;
    onPageInViewRef.current = onPageInView;
  });

  // Web fonts change line breaks: measure again once they are in.
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFonts((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  useIsoLayoutEffect(() => {
    const article = measureRef.current?.querySelector<HTMLElement>('article.cd-doc');
    if (!article) return;
    const open = articleOpen(html);
    const next = paginateArticle(article).map((inner) => `${open}${inner}</article>`);
    setPages(next);
    onPagesRef.current?.(next.length);
  }, [html, fonts]);

  useEffect(() => {
    if (!fit || !wrapRef.current) return;
    const el = wrapRef.current;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [fit]);

  // "Page 1 of N": the page nearest the top of the scroll box.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !pages) return;
    const sheets = Array.from(el.querySelectorAll<HTMLElement>('[data-a4-page]'));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.a4Page));
        if (visible.length) onPageInViewRef.current?.(Math.min(...visible));
      },
      { threshold: 0.35 },
    );
    for (const s of sheets) observer.observe(s);
    return () => observer.disconnect();
  }, [pages]);

  const scale = fit ? (width ? Math.min(1, (width - 2) / PAGE_WIDTH_PX) : 1) : zoom;

  return (
    <div ref={wrapRef} className={cn('relative min-w-0', className)} data-skeleton-block="document-pages" data-skeleton-measure="width">
      <ContractDocumentStyles />
      {/* The measuring copy: the A4 text width, out of sight and out of the accessibility tree. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        inert
        className="pointer-events-none invisible absolute start-0 top-0 -z-10 overflow-hidden"
        style={{ width: CONTENT_WIDTH_PX }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div
        className={cn('flex flex-col items-center gap-6 transition-opacity duration-150', dimmed && 'opacity-55')}
        style={{ zoom: scale }}
      >
        {(pages ?? []).map((page, i) => (
          <div
            key={i}
            data-a4-page={i + 1}
            role="group"
            aria-label={t('contractTemplates.print.pageLabel', { page: i + 1 })}
            className="h-[297mm] w-[210mm] shrink-0 overflow-hidden bg-card p-[20mm] shadow-card ring-1 ring-border"
            dangerouslySetInnerHTML={{ __html: page }}
          />
        ))}
      </div>
    </div>
  );
}
