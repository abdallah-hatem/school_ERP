'use client';

import {
  EMPTY_FIELD_TEXT,
  isContractFieldKey,
  type ContractFieldKey,
  type ContractFieldValues,
  type ContractLanguage,
} from '@school-erp/shared';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { createContext, useContext } from 'react';
import { cn } from '@/shared/lib/utils';
import { fieldName } from '../lib/fields';

/*
 * The template text's own nodes (spec → How it is built): a field chip (an inline atom holding a
 * key — the cursor steps over it as one character, it can't be typed into or half-deleted), an
 * optional phrase (an inline wrapper shown as `[ … ]`) and a manual page break. ProseMirror's
 * schema refuses anything else, so a paste is reduced to these and StarterKit's basics.
 */

export interface ChipSettings {
  /** The document's language: the chips name their field in it. */
  language: ContractLanguage;
  /** "Edit this copy": the chips show the copy's values instead of the field names. */
  values?: Partial<ContractFieldValues> | null;
  /** The page-break line's label, in the screen's language. */
  pageBreakLabel: string;
}

export const ChipContext = createContext<ChipSettings>({ language: 'AR', values: null, pageBreakLabel: '' });

function FieldChipView({ node, selected }: NodeViewProps) {
  const { language, values } = useContext(ChipContext);
  const key = node.attrs.key as ContractFieldKey;
  const value = values ? values[key] : undefined;
  const label = values ? (value === null || value === undefined || value === '' ? EMPTY_FIELD_TEXT : value) : fieldName(key, language);
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      data-field={key}
      title={values ? fieldName(key, language) : undefined}
      className={cn(
        'mx-px inline-flex items-baseline gap-1 rounded-md border px-1.5 align-baseline text-[0.86em] leading-snug font-semibold whitespace-nowrap select-none',
        values ? 'border-primary/25 bg-primary-soft/60 text-foreground' : 'border-primary/30 bg-primary-soft text-primary',
        selected && 'ring-2 ring-ring/55',
      )}
    >
      {values ? null : <span aria-hidden="true" className="size-1.5 shrink-0 self-center rounded-full bg-accent" />}
      <bdi>{label}</bdi>
    </NodeViewWrapper>
  );
}

export const FieldNode = Node.create({
  name: 'field',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-field'),
        renderHTML: (attrs) => ({ 'data-field': attrs.key }),
      },
    };
  },
  parseHTML() {
    // Only our own chips (copied within the editor); a pasted `{{name}}` stays text (edge case 22).
    return [{ tag: 'span[data-field]', getAttrs: (el) => (isContractFieldKey((el as HTMLElement).getAttribute('data-field')) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes)];
  },
  renderText({ node }) {
    return `[${String(node.attrs.key)}]`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(FieldChipView, { as: 'span' });
  },
});

export const OptionalNode = Node.create({
  name: 'optional',
  group: 'inline',
  inline: true,
  // No optional inside an optional (spec → Optional phrases).
  content: '(text | hardBreak | field)*',
  marks: '_',
  parseHTML() {
    return [{ tag: 'span[data-optional]' }];
  },
  renderHTML() {
    return ['span', { 'data-optional': '', class: 'ce-optional' }, 0];
  },
});

function PageBreakView({ selected }: NodeViewProps) {
  const { pageBreakLabel } = useContext(ChipContext);
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-page-break=""
      className={cn('my-4 flex items-center gap-3 text-xs font-semibold text-muted-foreground select-none', selected && 'text-primary')}
    >
      <span className="h-0 flex-1 border-t-2 border-dashed border-current" />
      <span dir="auto">{pageBreakLabel}</span>
      <span className="h-0 flex-1 border-t-2 border-dashed border-current" />
    </NodeViewWrapper>
  );
}

export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },
  renderHTML() {
    return ['div', { 'data-page-break': '' }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageBreakView);
  },
});

/** The editor's own look on top of the shared `.cd-doc` CSS: brackets, placeholder, tables, selection. */
export const EDITOR_CSS = `
.ce-root{outline:none;min-height:18rem}
.ce-root .ce-optional{background:var(--accent-soft);border-radius:3px;padding:0 1px}
.ce-root .ce-optional::before{content:'[';font-weight:800;color:var(--accent-foreground);padding-inline-end:1px}
.ce-root .ce-optional::after{content:']';font-weight:800;color:var(--accent-foreground);padding-inline-start:1px}
.ce-root p.is-editor-empty:first-child::before{content:attr(data-placeholder);float:inline-start;height:0;color:var(--muted-foreground);pointer-events:none}
.ce-root .tableWrapper{overflow-x:auto}
.ce-root table{width:100%;border-collapse:collapse;margin:.4em 0 .8em;table-layout:fixed}
.ce-root td,.ce-root th{border:1px solid #9fb3ad;padding:4px 8px;vertical-align:top;position:relative}
.ce-root th{background:#eef4f2;font-weight:600}
.ce-root td p,.ce-root th p{margin:0}
.ce-root .selectedCell{background:var(--primary-soft)}
.ce-root .ProseMirror-gapcursor:after{border-top-color:var(--primary)}
`.trim();
