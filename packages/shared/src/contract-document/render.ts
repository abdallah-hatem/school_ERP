import { type ContractFieldKey, type ContractFieldValues, type ContractLanguage } from './fields';
import type {
  BlockNode,
  ContractDocument,
  ContractMark,
  FieldNode,
  HardBreakNode,
  InlineNode,
  OptionalNode,
  TextNode,
} from './schema';

/*
 * The one renderer (spec → One renderer): a stored document + the filled values → HTML. The web
 * preview and the API's PDF call the same function with the same CSS (`CONTRACT_DOCUMENT_CSS`), so
 * the preview is the PDF. Every text and value is escaped; only the nodes of the schema produce
 * markup, so no user HTML ever reaches a page or the PDF renderer.
 */

/** The dotted line an empty field prints as, to be filled by hand. */
export const EMPTY_FIELD_TEXT = '…………';

export interface RenderContractOptions {
  language: ContractLanguage;
  values: Partial<ContractFieldValues>;
  /** Fields the reader may not see (the salary, in "Preview with an employee"): shown greyed. */
  hidden?: readonly ContractFieldKey[];
  /** Text a hidden field shows (the screen's "hidden"). */
  hiddenText?: string;
  /** The preview's marks: filled values highlighted, empty ones and left-out phrases flagged. */
  highlight?: boolean;
  /** In `highlight`, the note shown where a phrase was left out (its empty fields). */
  leftOutText?: (emptyFields: readonly ContractFieldKey[]) => string;
  /** The letterhead above the text: the school's logo (a data URL in the PDF), name and address. */
  letterhead?: { logoSrc: string | null } | null;
}

export interface RenderedContract {
  /** `<article class="cd-doc" …>…</article>` */
  html: string;
  /** Fields printed empty (a dotted line), outside optional phrases, each once. */
  emptyFields: ContractFieldKey[];
  /** The optional phrases left out, each with its empty fields. */
  phrasesLeftOut: ContractFieldKey[][];
  /** The fields the text uses, each once. */
  fields: ContractFieldKey[];
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const ALIGN_CLASS = { left: 'cd-a-left', center: 'cd-a-center', right: 'cd-a-right', justify: 'cd-a-justify' } as const;

function alignClass(attrs: { textAlign?: keyof typeof ALIGN_CLASS | null } | undefined): string {
  const align = attrs?.textAlign;
  return align ? ` class="${ALIGN_CLASS[align]}"` : '';
}

const MARK_TAG: Record<ContractMark['type'], string> = { bold: 'strong', italic: 'em', underline: 'u' };

class Renderer {
  readonly empty = new Set<ContractFieldKey>();
  readonly leftOut: ContractFieldKey[][] = [];
  readonly used = new Set<ContractFieldKey>();
  private readonly hidden: ReadonlySet<ContractFieldKey>;

  constructor(private readonly options: RenderContractOptions) {
    this.hidden = new Set(options.hidden ?? []);
  }

  private has(key: ContractFieldKey): boolean {
    if (this.hidden.has(key)) return true;
    const value = this.options.values[key];
    return value !== null && value !== undefined && value !== '';
  }

  text(node: TextNode): string {
    let html = escapeHtml(node.text);
    // Marks nest in a fixed order, so the same text always renders the same markup.
    for (const type of ['underline', 'italic', 'bold'] as const) {
      if (node.marks?.some((m) => m.type === type)) html = `<${MARK_TAG[type]}>${html}</${MARK_TAG[type]}>`;
    }
    return html;
  }

  field(node: FieldNode, inOptional: boolean): string {
    const key = node.attrs.key;
    this.used.add(key);
    const highlight = this.options.highlight;
    const data = ` data-field="${escapeHtml(key)}"`;
    if (this.hidden.has(key)) {
      return `<span class="cd-field cd-hidden"${data}>${escapeHtml(this.options.hiddenText ?? '••••••')}</span>`;
    }
    const value = this.options.values[key];
    if (value === null || value === undefined || value === '') {
      if (!inOptional) this.empty.add(key);
      return `<span class="cd-field cd-empty${highlight ? ' cd-mark' : ''}"${data}>${EMPTY_FIELD_TEXT}</span>`;
    }
    return `<span class="cd-field${highlight ? ' cd-filled cd-mark' : ''}"${data}><bdi>${escapeHtml(value)}</bdi></span>`;
  }

  inline(node: InlineNode, inOptional = false): string {
    switch (node.type) {
      case 'text':
        return this.text(node);
      case 'hardBreak':
        return '<br>';
      case 'field':
        return this.field(node, inOptional);
      case 'optional':
        return this.optional(node);
    }
  }

  /** `[ … ]` prints only when every field inside has a value (spec → Optional phrases). */
  optional(node: OptionalNode): string {
    const content: Array<TextNode | HardBreakNode | FieldNode> = node.content ?? [];
    const keys = content.filter((n): n is FieldNode => n.type === 'field').map((n) => n.attrs.key);
    for (const key of keys) this.used.add(key);
    const missing = [...new Set(keys.filter((k) => !this.has(k)))];
    if (missing.length > 0) {
      this.leftOut.push(missing);
      if (!this.options.highlight) return '';
      const note = this.options.leftOutText?.(missing) ?? '';
      return `<mark class="cd-left-out" data-fields="${escapeHtml(missing.join(' '))}">${escapeHtml(note)}</mark>`;
    }
    return content.map((n) => this.inline(n, true)).join('');
  }

  inlines(content: readonly InlineNode[] | undefined): string {
    return (content ?? []).map((n) => this.inline(n)).join('');
  }

  block(node: BlockNode): string {
    switch (node.type) {
      case 'paragraph': {
        const body = this.inlines(node.content);
        return `<p dir="auto"${alignClass(node.attrs)}>${body === '' ? '<br>' : body}</p>`;
      }
      case 'heading': {
        const tag = `h${node.attrs.level}`;
        return `<${tag} dir="auto"${alignClass(node.attrs)}>${this.inlines(node.content)}</${tag}>`;
      }
      case 'orderedList': {
        const start = node.attrs?.start && node.attrs.start > 1 ? ` start="${Math.trunc(node.attrs.start)}"` : '';
        return `<ol${start}>${node.content.map((item) => `<li dir="auto">${this.blocks(item.content)}</li>`).join('')}</ol>`;
      }
      case 'bulletList':
        return `<ul>${node.content.map((item) => `<li dir="auto">${this.blocks(item.content)}</li>`).join('')}</ul>`;
      case 'table': {
        const rows = node.content
          .map((row) => {
            const cells = row.content
              .map((cell) => {
                const tag = cell.type === 'tableHeader' ? 'th' : 'td';
                const colspan = cell.attrs?.colspan && cell.attrs.colspan > 1 ? ` colspan="${Math.trunc(cell.attrs.colspan)}"` : '';
                const rowspan = cell.attrs?.rowspan && cell.attrs.rowspan > 1 ? ` rowspan="${Math.trunc(cell.attrs.rowspan)}"` : '';
                return `<${tag} dir="auto"${colspan}${rowspan}>${this.blocks(cell.content)}</${tag}>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');
        return `<table class="cd-table"><tbody>${rows}</tbody></table>`;
      }
      case 'pageBreak':
        return '<div class="cd-page-break" data-page-break=""></div>';
    }
  }

  blocks(content: readonly BlockNode[]): string {
    return content.map((b) => this.block(b)).join('');
  }

  letterhead(): string {
    const head = this.options.letterhead;
    if (!head) return '';
    const name = this.options.values['school.name'];
    const address = this.options.values['school.address'];
    const logo = head.logoSrc ? `<img class="cd-logo" src="${escapeHtml(head.logoSrc)}" alt="">` : '';
    const lines = [
      name ? `<div class="cd-school-name"><bdi>${escapeHtml(name)}</bdi></div>` : '',
      address ? `<div class="cd-school-address"><bdi>${escapeHtml(address)}</bdi></div>` : '',
    ].join('');
    if (!logo && !lines) return '';
    return `<header class="cd-letterhead">${logo}<div>${lines}</div></header>`;
  }
}

/** Renders a document with its values (spec → One renderer). Pure; same input, same HTML. */
export function renderContractDocument(document: ContractDocument, options: RenderContractOptions): RenderedContract {
  const renderer = new Renderer(options);
  const dir = options.language === 'AR' ? 'rtl' : 'ltr';
  const lang = options.language === 'AR' ? 'ar' : 'en';
  const body = renderer.blocks(document.content);
  const html = `<article class="cd-doc" dir="${dir}" lang="${lang}">${renderer.letterhead()}${body}</article>`;
  return {
    html,
    emptyFields: [...renderer.empty],
    phrasesLeftOut: renderer.leftOut,
    fields: [...renderer.used],
  };
}

/**
 * A copy's document as printed (spec → Data: `contract_copies.document`): each field holds its
 * value inline, and the phrases left out are gone — readable without the template or the values.
 */
export function fillContractDocument(
  document: ContractDocument,
  values: Partial<ContractFieldValues>,
): ContractDocument {
  const has = (key: ContractFieldKey) => {
    const v = values[key];
    return v !== null && v !== undefined && v !== '';
  };
  const fill = (n: TextNode | HardBreakNode | FieldNode): TextNode | HardBreakNode | FieldNode =>
    n.type === 'field' ? { type: 'field', attrs: { key: n.attrs.key, value: values[n.attrs.key] ?? null } } : n;
  const inlines = (content: readonly InlineNode[] | undefined): InlineNode[] =>
    (content ?? []).flatMap((n): InlineNode[] => {
      if (n.type !== 'optional') return [fill(n)];
      const inner = n.content ?? [];
      const keys = inner.filter((c): c is FieldNode => c.type === 'field').map((c) => c.attrs.key);
      return keys.every(has) ? inner.map(fill) : [];
    });
  const blocks = (content: readonly BlockNode[]): BlockNode[] =>
    content.map((b): BlockNode => {
      switch (b.type) {
        case 'paragraph':
        case 'heading':
          return { ...b, content: inlines(b.content) };
        case 'orderedList':
        case 'bulletList':
          return { ...b, content: b.content.map((item) => ({ ...item, content: blocks(item.content) })) } as BlockNode;
        case 'table':
          return {
            ...b,
            content: b.content.map((row) => ({ ...row, content: row.content.map((cell) => ({ ...cell, content: blocks(cell.content) })) })),
          };
        case 'pageBreak':
          return b;
      }
    });
  return { type: 'doc', content: blocks(document.content) };
}

/** The values a kept document holds inline (`fillContractDocument`'s field values). */
export function valuesOfFilledDocument(document: ContractDocument): Partial<ContractFieldValues> {
  const out: Partial<ContractFieldValues> = {};
  const visit = (content: readonly BlockNode[]) => {
    for (const b of content) {
      if (b.type === 'paragraph' || b.type === 'heading') {
        for (const n of b.content ?? []) {
          if (n.type === 'field') out[n.attrs.key] = n.attrs.value ?? null;
          if (n.type === 'optional') for (const c of n.content ?? []) if (c.type === 'field') out[c.attrs.key] = c.attrs.value ?? null;
        }
      } else if (b.type === 'orderedList' || b.type === 'bulletList') {
        for (const item of b.content) visit(item.content);
      } else if (b.type === 'table') {
        for (const row of b.content) for (const cell of row.content) visit(cell.content);
      }
    }
  };
  visit(document.content);
  return out;
}

/**
 * The document's look (A4 text block, 20 mm margins come from the page, not from here). Scoped to
 * `.cd-doc`; the fonts are `--font-latin` / `--font-arabic` (the app's next/font faces on screen,
 * the bundled files in the PDF).
 *
 * Pages break between blocks, never inside a paragraph, heading, list item or table row (and not
 * right after a heading): the web preview paginates the same way, block by block, so its page
 * count is the PDF's (edge case 26).
 */
export const CONTRACT_DOCUMENT_CSS = `
.cd-doc{font-family:var(--font-latin,'Contract Latin'),var(--font-arabic,'Contract Arabic'),'Contract Arabic',sans-serif;font-size:11.5pt;line-height:1.75;color:#1a2421;word-wrap:break-word;overflow-wrap:anywhere}
.cd-doc[dir=rtl]{font-family:var(--font-arabic,'Contract Arabic'),var(--font-latin,'Contract Latin'),'Contract Latin',sans-serif}
.cd-doc p{margin:0 0 .55em}
.cd-doc h1{font-size:16pt;font-weight:700;text-align:center;margin:.4em 0 .7em}
.cd-doc h2{font-size:13pt;font-weight:700;margin:.8em 0 .35em}
.cd-doc h3{font-size:11.5pt;font-weight:700;margin:.7em 0 .3em}
.cd-doc ol,.cd-doc ul{margin:0 0 .55em;padding-inline-start:1.6em}
.cd-doc li>p{margin:0 0 .25em}
.cd-doc .cd-a-left{text-align:left}.cd-doc .cd-a-center{text-align:center}.cd-doc .cd-a-right{text-align:right}.cd-doc .cd-a-justify{text-align:justify}
.cd-doc .cd-table{width:100%;border-collapse:collapse;margin:.4em 0 .8em;break-inside:avoid}
.cd-doc .cd-table td,.cd-doc .cd-table th{border:1px solid #9fb3ad;padding:4px 8px;vertical-align:top;text-align:start}
.cd-doc .cd-table th{background:#eef4f2;font-weight:600}
.cd-doc .cd-table p{margin:0}
.cd-doc tr{break-inside:avoid}
.cd-doc p,.cd-doc h1,.cd-doc h2,.cd-doc h3,.cd-doc li{break-inside:avoid}
.cd-doc h1,.cd-doc h2,.cd-doc h3{break-after:avoid}
.cd-doc .cd-page-break{break-after:page;height:0}
.cd-doc .cd-field{unicode-bidi:isolate}
.cd-doc .cd-empty{letter-spacing:.08em;color:#5b6b66}
.cd-doc .cd-hidden{color:#8a9893;background:#eef1f0;border-radius:4px;padding:0 4px}
.cd-doc .cd-mark.cd-filled{background:#e3f2ee;border-radius:3px;box-shadow:0 0 0 1px #b9ddd4}
.cd-doc .cd-mark.cd-empty{background:#fff4d6;border-radius:3px;box-shadow:0 0 0 1px #f2d48a}
.cd-doc .cd-left-out{background:#fff4d6;color:#7a5a00;border-radius:3px;padding:0 4px;font-size:.85em}
.cd-doc .cd-letterhead{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0f766e;padding-bottom:10px;margin-bottom:16px}
.cd-doc .cd-logo{width:52px;height:52px;object-fit:contain}
.cd-doc .cd-school-name{font-weight:700;font-size:13pt;line-height:1.4}
.cd-doc .cd-school-address{font-size:9.5pt;color:#5b6b66;line-height:1.4}
`.trim();
