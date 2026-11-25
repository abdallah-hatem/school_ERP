import { z } from 'zod';
import { CONTRACT_FIELD_KEYS, type ContractFieldKey } from './fields';

/*
 * The document a contract template's text is stored as (spec → How it is built): ProseMirror JSON as
 * the TipTap editor produces it, never HTML. Only the nodes and marks below exist — the editor's
 * schema reduces a paste to them, and the API checks every save and print with
 * `parseContractDocument`, so no other node, attribute or HTML reaches the renderer.
 */

/** A template's text is at most 200 KB (about 60 A4 pages; spec → Templates, edge case 23). */
export const CONTRACT_DOCUMENT_MAX_BYTES = 200 * 1024;

export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

const MARK_TYPES = ['bold', 'italic', 'underline'] as const;
export type ContractMarkType = (typeof MARK_TYPES)[number];

export interface ContractMark {
  type: ContractMarkType;
}
export interface TextNode {
  type: 'text';
  text: string;
  marks?: ContractMark[];
}
export interface HardBreakNode {
  type: 'hardBreak';
}
/** A field chip: one atom holding a key, filled when printing. `value` is set only in a kept copy's document. */
export interface FieldNode {
  type: 'field';
  attrs: { key: ContractFieldKey; value?: string | null };
}
/** `[ … ]`: prints only when every field inside has a value (spec → Optional phrases). */
export interface OptionalNode {
  type: 'optional';
  content?: Array<TextNode | HardBreakNode | FieldNode>;
}
export type InlineNode = TextNode | HardBreakNode | FieldNode | OptionalNode;

interface AlignAttrs {
  textAlign?: TextAlign | null;
}
export interface ParagraphNode {
  type: 'paragraph';
  attrs?: AlignAttrs;
  content?: InlineNode[];
}
export interface HeadingNode {
  type: 'heading';
  attrs: AlignAttrs & { level: 1 | 2 | 3 };
  content?: InlineNode[];
}
export interface ListItemNode {
  type: 'listItem';
  content: BlockNode[];
}
export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number; type?: string | null };
  content: ListItemNode[];
}
export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}
export interface TableCellNode {
  type: 'tableCell' | 'tableHeader';
  attrs?: { colspan?: number; rowspan?: number; colwidth?: number[] | null };
  content: BlockNode[];
}
export interface TableRowNode {
  type: 'tableRow';
  content: TableCellNode[];
}
export interface TableNode {
  type: 'table';
  content: TableRowNode[];
}
/** A manual page break. */
export interface PageBreakNode {
  type: 'pageBreak';
}
export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | OrderedListNode
  | BulletListNode
  | TableNode
  | PageBreakNode;

export interface ContractDocument {
  type: 'doc';
  content: BlockNode[];
}

const fieldKey = z.enum(CONTRACT_FIELD_KEYS as [ContractFieldKey, ...ContractFieldKey[]]);
const align = z.object({ textAlign: z.enum(TEXT_ALIGNS).nullable().optional() }).strict();

const textNode = z
  .object({
    type: z.literal('text'),
    text: z.string().min(1),
    marks: z.array(z.object({ type: z.enum(MARK_TYPES) }).strict()).optional(),
  })
  .strict();
const hardBreakNode = z.object({ type: z.literal('hardBreak') }).strict();
const fieldNode = z
  .object({
    type: z.literal('field'),
    attrs: z.object({ key: fieldKey, value: z.string().nullable().optional() }).strict(),
  })
  .strict();
const optionalNode = z
  .object({
    type: z.literal('optional'),
    // No optional inside an optional (spec → Optional phrases, GUESS): the schema has no slot for one.
    content: z.array(z.union([textNode, hardBreakNode, fieldNode])).optional(),
  })
  .strict();
const inlineNode = z.union([textNode, hardBreakNode, fieldNode, optionalNode]);

const paragraphNode = z
  .object({ type: z.literal('paragraph'), attrs: align.optional(), content: z.array(inlineNode).optional() })
  .strict();
const headingNode = z
  .object({
    type: z.literal('heading'),
    attrs: z
      .object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]), textAlign: z.enum(TEXT_ALIGNS).nullable().optional() })
      .strict(),
    content: z.array(inlineNode).optional(),
  })
  .strict();
const pageBreakNode = z.object({ type: z.literal('pageBreak') }).strict();

// Lists and tables hold blocks: recursive.
const blockNode: z.ZodType<BlockNode> = z.lazy(() =>
  z.union([paragraphNode, headingNode, orderedListNode, bulletListNode, tableNode, pageBreakNode]),
) as z.ZodType<BlockNode>;
const listItemNode = z.object({ type: z.literal('listItem'), content: z.array(blockNode).min(1) }).strict();
const orderedListNode = z
  .object({
    type: z.literal('orderedList'),
    attrs: z
      .object({ start: z.number().int().min(1).max(10_000).optional(), type: z.string().max(8).nullable().optional() })
      .strict()
      .optional(),
    content: z.array(listItemNode).min(1),
  })
  .strict();
const bulletListNode = z.object({ type: z.literal('bulletList'), content: z.array(listItemNode).min(1) }).strict();
const tableCellNode = z
  .object({
    type: z.union([z.literal('tableCell'), z.literal('tableHeader')]),
    attrs: z
      .object({
        colspan: z.number().int().min(1).max(20).optional(),
        rowspan: z.number().int().min(1).max(200).optional(),
        colwidth: z.array(z.number().int().min(1).max(2000)).nullable().optional(),
      })
      .strict()
      .optional(),
    content: z.array(blockNode).min(1),
  })
  .strict();
const tableRowNode = z.object({ type: z.literal('tableRow'), content: z.array(tableCellNode).min(1) }).strict();
const tableNode = z.object({ type: z.literal('table'), content: z.array(tableRowNode).min(1) }).strict();

/** The zod schema of a stored document (node types, field keys). Size and phrase rules: `parseContractDocument`. */
export const contractDocumentSchema = z
  .object({ type: z.literal('doc'), content: z.array(blockNode) })
  .strict() as unknown as z.ZodType<ContractDocument>;

/** How deep objects and arrays may nest (lists in tables in lists…): far beyond any real contract. */
export const CONTRACT_DOCUMENT_MAX_DEPTH = 20;

/** The deepest nesting of objects inside `content` arrays (iterative: no recursion on untrusted input). */
export function nestingDepth(input: unknown): number {
  let deepest = 0;
  const stack: Array<{ node: unknown; depth: number }> = [{ node: input, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (node === null || typeof node !== 'object') continue;
    deepest = Math.max(deepest, depth);
    if (deepest > CONTRACT_DOCUMENT_MAX_DEPTH) return deepest;
    const content = (node as { content?: unknown }).content;
    if (Array.isArray(content)) for (const child of content) stack.push({ node: child, depth: depth + 1 });
  }
  return deepest;
}

/** Why a document is refused — each an `ErrorCode`. */
export type ContractDocumentProblem =
  | 'CONTRACT_DOCUMENT_INVALID'
  | 'TEMPLATE_TOO_LONG'
  | 'OPTIONAL_PHRASE_NEEDS_FIELD'
  | 'TEMPLATE_TEXT_EMPTY';

export type ContractDocumentParse =
  | { ok: true; document: ContractDocument }
  | { ok: false; problem: ContractDocumentProblem };

/** Its UTF-8 size as stored (JSON). */
export function contractDocumentBytes(document: unknown): number {
  return new TextEncoder().encode(JSON.stringify(document) ?? '').length;
}

/** Every inline node in reading order, with whether it sits in an optional phrase. */
export function* walkInline(
  document: ContractDocument,
): Generator<{ node: TextNode | HardBreakNode | FieldNode; optional: OptionalNode | null }> {
  function* blocks(list: readonly BlockNode[]): Generator<{ node: TextNode | HardBreakNode | FieldNode; optional: OptionalNode | null }> {
    for (const block of list) {
      if (block.type === 'paragraph' || block.type === 'heading') {
        for (const inline of block.content ?? []) {
          if (inline.type === 'optional') {
            for (const inner of inline.content ?? []) yield { node: inner, optional: inline };
          } else {
            yield { node: inline, optional: null };
          }
        }
      } else if (block.type === 'orderedList' || block.type === 'bulletList') {
        for (const item of block.content) yield* blocks(item.content);
      } else if (block.type === 'table') {
        for (const row of block.content) for (const cell of row.content) yield* blocks(cell.content);
      }
    }
  }
  yield* blocks(document.content);
}

/** Every optional phrase in reading order. */
export function optionalPhrasesOf(document: ContractDocument): OptionalNode[] {
  const out: OptionalNode[] = [];
  for (const { optional } of walkInline(document)) if (optional && out[out.length - 1] !== optional) out.push(optional);
  return out;
}

/** The field keys a document uses, in first-use order, each once. */
export function fieldsOfDocument(document: ContractDocument): ContractFieldKey[] {
  const seen = new Set<ContractFieldKey>();
  for (const { node } of walkInline(document)) if (node.type === 'field') seen.add(node.attrs.key);
  return [...seen];
}

/** Whether the document holds any visible text or field (an empty Arabic text can't be saved). */
export function hasContent(document: ContractDocument): boolean {
  for (const { node } of walkInline(document)) {
    if (node.type === 'field') return true;
    if (node.type === 'text' && node.text.trim() !== '') return true;
  }
  return false;
}

/**
 * Checks a document from a client: the schema, the 200 KB cap, and that each optional phrase holds a
 * field (edge case 8). `requireContent`: an empty text is refused (a template's Arabic text).
 */
export function parseContractDocument(input: unknown, options: { requireContent?: boolean } = {}): ContractDocumentParse {
  if (contractDocumentBytes(input) > CONTRACT_DOCUMENT_MAX_BYTES) return { ok: false, problem: 'TEMPLATE_TOO_LONG' };
  // Checked before the recursive schema: a deeply nested paste is a 400, never a stack overflow.
  if (nestingDepth(input) > CONTRACT_DOCUMENT_MAX_DEPTH) return { ok: false, problem: 'CONTRACT_DOCUMENT_INVALID' };
  const parsed = contractDocumentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problem: 'CONTRACT_DOCUMENT_INVALID' };
  const document = parsed.data;
  if (hasOptionalWithoutField(document)) return { ok: false, problem: 'OPTIONAL_PHRASE_NEEDS_FIELD' };
  if (options.requireContent && !hasContent(document)) return { ok: false, problem: 'TEMPLATE_TEXT_EMPTY' };
  return { ok: true, document };
}

/** An optional phrase holding no field — empty or text only (edge case 8). */
function hasOptionalWithoutField(document: ContractDocument): boolean {
  const check = (list: readonly BlockNode[]): boolean =>
    list.some((block) => {
      if (block.type === 'paragraph' || block.type === 'heading') {
        return (block.content ?? []).some((n) => n.type === 'optional' && !(n.content ?? []).some((c) => c.type === 'field'));
      }
      if (block.type === 'orderedList' || block.type === 'bulletList') return block.content.some((item) => check(item.content));
      if (block.type === 'table') return block.content.some((row) => row.content.some((cell) => check(cell.content)));
      return false;
    });
  return check(document.content);
}

/** Whether a document uses a salary-type field (spec → Printing → Salary). */
export function documentUsesSalary(document: ContractDocument, isSalary: (key: ContractFieldKey) => boolean): boolean {
  return fieldsOfDocument(document).some(isSalary);
}

/** An empty document (one empty paragraph), the editor's starting point. */
export function emptyContractDocument(): ContractDocument {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}
