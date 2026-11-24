'use client';

import { EMPTY_FIELD_TEXT, type ContractFieldKey, type ContractFieldValues, type ContractLanguage } from '@school-erp/shared';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { createContext, useContext } from 'react';
import { cn } from '@/shared/lib/utils';
import { fieldName } from '../lib/fields';
import { FieldSchemaNode, PageBreakSchemaNode } from './schema';

export { OptionalNode } from './schema';

/*
 * The React views of the template text's nodes (`schema.ts`): a field chip names its field in the
 * document's language (or, in "Edit this copy", shows the copy's value, still locked) and a page
 * break draws a labelled dashed line.
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

export const FieldNode = FieldSchemaNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FieldChipView, { as: 'span' });
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

export const PageBreakNode = PageBreakSchemaNode.extend({
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
.ce-root td,.ce-root th{border:1px solid var(--input);padding:4px 8px;vertical-align:top;position:relative}
.ce-root th{background:var(--secondary);font-weight:600}
.ce-root td p,.ce-root th p{margin:0}
.ce-root .selectedCell{background:var(--primary-soft)}
.ce-root .ProseMirror-gapcursor:after{border-top-color:var(--primary)}
`.trim();
