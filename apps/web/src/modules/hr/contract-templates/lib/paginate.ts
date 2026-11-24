/*
 * Browser-side pagination of a rendered contract (spec → Printing; edge case 26): the PDF is A4 with
 * 20 mm margins, so the preview cuts the same 170 × 257 mm text block into pages, block by block —
 * at a manual page break, and before a block that would overflow the page. The shared print CSS
 * keeps paragraphs, headings, list items and table rows whole and a heading with what follows, so
 * Chromium breaks the PDF at the same places and the page counts match.
 */

export const MM_PX = 96 / 25.4;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_MARGIN_MM = 20;
/** The text block's size in CSS pixels. */
export const CONTENT_WIDTH_PX = (A4_WIDTH_MM - 2 * A4_MARGIN_MM) * MM_PX;
export const CONTENT_HEIGHT_PX = (A4_HEIGHT_MM - 2 * A4_MARGIN_MM) * MM_PX;
export const PAGE_WIDTH_PX = A4_WIDTH_MM * MM_PX;

/** One piece the pages are cut between: a block, a list item or a table row. */
interface Unit {
  html: string;
  top: number;
  bottom: number;
  /** A list item or a row: rebuilt inside its list or table on its page. */
  container: { key: number; open: (index: number) => string; close: string } | null;
  /** Its index inside its container (a numbered list continues at start + index). */
  index: number;
  heading: boolean;
  /** A manual page break: the next unit starts a page. */
  pageBreak: boolean;
}

function units(article: HTMLElement): Unit[] {
  const out: Unit[] = [];
  const base = article.getBoundingClientRect().top;
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - base, bottom: r.bottom - base };
  };
  let containers = 0;
  for (const child of Array.from(article.children)) {
    const tag = child.tagName.toLowerCase();
    if (child.classList.contains('cd-page-break')) {
      out.push({ html: '', ...box(child), container: null, index: 0, heading: false, pageBreak: true });
      continue;
    }
    if (tag === 'ol' || tag === 'ul') {
      const key = ++containers;
      const start = tag === 'ol' ? Number(child.getAttribute('start') ?? '1') || 1 : 1;
      const items = Array.from(child.children);
      const container = {
        key,
        open: (index: number) => (tag === 'ol' ? `<ol${start + index > 1 ? ` start="${start + index}"` : ''}>` : '<ul>'),
        close: `</${tag}>`,
      };
      items.forEach((li, index) => out.push({ html: li.outerHTML, ...box(li), container, index, heading: false, pageBreak: false }));
      continue;
    }
    if (tag === 'table') {
      const key = ++containers;
      const cls = child.getAttribute('class') ?? '';
      const container = { key, open: () => `<table class="${cls}"><tbody>`, close: '</tbody></table>' };
      Array.from(child.querySelectorAll(':scope > tbody > tr, :scope > tr')).forEach((tr, index) =>
        out.push({ html: tr.outerHTML, ...box(tr), container, index, heading: false, pageBreak: false }),
      );
      continue;
    }
    out.push({ html: child.outerHTML, ...box(child), container: null, index: 0, heading: /^h[1-3]$/.test(tag), pageBreak: false });
  }
  return out;
}

/** Joins a page's units, reopening each list or table they belong to. */
function pageHtml(page: Unit[]): string {
  let html = '';
  let open: Unit['container'] = null;
  for (const unit of page) {
    if (unit.container !== open) {
      if (open) html += open.close;
      if (unit.container) html += unit.container.open(unit.index);
      open = unit.container;
    }
    html += unit.html;
  }
  if (open) html += open.close;
  return html;
}

/**
 * Cuts a laid-out `.cd-doc` article (rendered at `CONTENT_WIDTH_PX`) into pages. Returns each page's
 * inner HTML, to wrap in the same `<article class="cd-doc" dir lang>`.
 */
export function paginateArticle(article: HTMLElement, pageHeight = CONTENT_HEIGHT_PX): string[] {
  const all = units(article);
  const pages: Unit[][] = [];
  let page: Unit[] = [];
  let pageTop = 0;
  const startPage = (unit: Unit | undefined) => {
    if (page.length) pages.push(page);
    page = [];
    pageTop = unit ? unit.top : 0;
  };
  for (let i = 0; i < all.length; i++) {
    const unit = all[i]!;
    if (unit.pageBreak) {
      startPage(all[i + 1]);
      continue;
    }
    if (page.length === 0) pageTop = unit.top;
    const fits = unit.bottom - pageTop <= pageHeight + 0.5;
    if (!fits && page.length > 0) startPage(unit);
    else if (unit.heading && page.length > 0) {
      // A heading stays with what follows it (`break-after: avoid`).
      const next = all[i + 1];
      if (next && !next.pageBreak && next.bottom - pageTop > pageHeight + 0.5) startPage(unit);
    }
    page.push(unit);
  }
  if (page.length || pages.length === 0) pages.push(page);
  return pages.map(pageHtml);
}
