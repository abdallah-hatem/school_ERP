import { parseContractDocument, type ContractDocument, type ContractDocumentProblem } from '@school-erp/shared';

/*
 * The editor's JSON → the stored document (spec → How it is built). TipTap writes every attribute
 * it knows, defaults included (`textAlign: null`, `colspan: 1`, `start: 1`); the stored document
 * keeps only what means something, so a save is the same bytes whatever the editor's defaults are.
 * The result is then checked with the shared `parseContractDocument`, as the API checks it.
 */

interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const MARKS = new Set(['bold', 'italic', 'underline']);

function clean(node: JsonNode): JsonNode {
  const out: JsonNode = { type: node.type };
  const a = node.attrs ?? {};
  switch (node.type) {
    case 'paragraph':
      if (a.textAlign) out.attrs = { textAlign: a.textAlign };
      break;
    case 'heading':
      out.attrs = { level: a.level, ...(a.textAlign ? { textAlign: a.textAlign } : {}) };
      break;
    case 'orderedList':
      if (typeof a.start === 'number' && a.start > 1) out.attrs = { start: a.start };
      break;
    case 'tableCell':
    case 'tableHeader': {
      const attrs: Record<string, unknown> = {};
      if (typeof a.colspan === 'number' && a.colspan > 1) attrs.colspan = a.colspan;
      if (typeof a.rowspan === 'number' && a.rowspan > 1) attrs.rowspan = a.rowspan;
      if (Array.isArray(a.colwidth) && a.colwidth.some((w) => typeof w === 'number' && w > 0)) attrs.colwidth = a.colwidth;
      if (Object.keys(attrs).length) out.attrs = attrs;
      break;
    }
    case 'field':
      out.attrs = { key: a.key };
      break;
    case 'text': {
      out.text = node.text;
      const marks = (node.marks ?? []).filter((m) => MARKS.has(m.type)).map((m) => ({ type: m.type }));
      if (marks.length) out.marks = marks;
      break;
    }
    default:
      // Any other node keeps its attributes as they are: the schema check refuses what it doesn't know.
      if (node.attrs && Object.keys(node.attrs).length) out.attrs = node.attrs;
  }
  if (node.content?.length) out.content = node.content.map(clean);
  return out;
}

/** TipTap's `getJSON()` → the stored document's shape (not yet checked). */
export function toStoredDocument(json: unknown): ContractDocument {
  return clean(json as JsonNode) as unknown as ContractDocument;
}

export type CheckedDocument = { ok: true; document: ContractDocument } | { ok: false; problem: ContractDocumentProblem };

/** The editor's JSON, cleaned and checked like the API checks it (`requireContent` for the Arabic text). */
export function checkEditorDocument(json: unknown, options: { requireContent?: boolean } = {}): CheckedDocument {
  return parseContractDocument(toStoredDocument(json), options);
}

/** Whether a text is empty (one empty paragraph): an English text left empty is saved as none. */
export function isEmptyDocument(document: ContractDocument): boolean {
  return document.content.every((b) => b.type === 'paragraph' && !(b.content?.length));
}
