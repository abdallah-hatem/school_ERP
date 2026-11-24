import type { Editor } from '@tiptap/core';

/** Why "Optional phrase" refused (each a message under `contractTemplates.editor`, or the error code's). */
export type OptionalRefusal = 'optionalSelect' | 'optionalOneLine' | 'optionalNested' | 'needsField';

/**
 * The toolbar's "Optional phrase" (spec → Optional phrases): inside a phrase it takes the brackets
 * off again; otherwise it wraps the selection in `[ … ]`. Refused — nothing changes — when nothing
 * is selected, when the selection spans paragraphs, when it holds another phrase, and when it holds
 * no field ("An optional phrase needs a field", edge case 8). Returns the refusal, or null.
 */
export function toggleOptionalPhrase(editor: Editor): OptionalRefusal | null {
  const { state } = editor;
  const { from, to, $from, $to, empty } = state.selection;
  const optional = state.schema.nodes.optional;
  if (!optional) return 'optionalNested';

  // Inside a phrase (the cursor or a selection in it): unwrap it.
  for (const $pos of [$from, $to]) {
    if ($pos.parent.type === optional) {
      const start = $pos.before();
      const node = $pos.parent;
      editor.chain().focus().command(({ tr }) => {
        tr.replaceWith(start, start + node.nodeSize, node.content);
        return true;
      }).run();
      return null;
    }
  }

  if (empty) return 'optionalSelect';
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return 'optionalOneLine';
  const slice = state.doc.slice(from, to).content;
  let hasField = false;
  let other = false;
  slice.forEach((node) => {
    if (node.type.name === 'field') hasField = true;
    else if (!node.isText && node.type.name !== 'hardBreak') other = true;
  });
  if (other) return 'optionalNested';
  if (!hasField) return 'needsField';
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(from, to, optional.create(null, slice));
      return true;
    })
    .run();
  return null;
}
