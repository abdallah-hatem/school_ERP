import { isContractFieldKey } from '@school-erp/shared';
import { Node, mergeAttributes } from '@tiptap/core';
import type { StarterKitOptions } from '@tiptap/starter-kit';

/*
 * The template text's own nodes (spec → How it is built), schema only — the editor adds their React
 * views (`nodes.tsx`): a field chip (an inline atom holding a key — the cursor steps over it as one
 * character, it can't be typed into or half-deleted), an optional phrase (an inline wrapper shown as
 * `[ … ]`) and a manual page break. ProseMirror's schema refuses anything else, so a paste is
 * reduced to these and StarterKit's basics.
 */

export const FieldSchemaNode = Node.create({
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

export const PageBreakSchemaNode = Node.create({
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
});

/** StarterKit as the schema allows it: no code, quotes, strike, rules or links (edge case 22). */
export const STARTER_KIT_OPTIONS: Partial<StarterKitOptions> = {
  code: false,
  codeBlock: false,
  blockquote: false,
  strike: false,
  horizontalRule: false,
  link: false,
  heading: { levels: [1, 2, 3] },
};
