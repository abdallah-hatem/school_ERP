// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { checkEditorDocument, toStoredDocument } from '../lib/editor-json';
import { toggleOptionalPhrase } from './optional';
import { FieldSchemaNode, OptionalNode, PageBreakSchemaNode, STARTER_KIT_OPTIONS } from './schema';

/*
 * The editor's schema and its two own commands, on a headless TipTap editor with the same
 * extensions as the screen (the React chip views aside): inserting a field chip, and "Optional
 * phrase" wrapping a selection — refused without a field (edge case 8).
 */

let editor: Editor | null = null;

function make(content: unknown) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure(STARTER_KIT_OPTIONS),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      TableKit.configure({ table: { resizable: false } }),
      FieldSchemaNode,
      OptionalNode,
      PageBreakSchemaNode,
    ],
    content: content as Record<string, unknown>,
  });
  return editor;
}

const paragraph = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

describe('the template editor', () => {
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('a field from the Fields panel lands at the cursor as one chip holding its key', () => {
    const e = make(paragraph({ type: 'text', text: 'Name: ' }));
    e.commands.setTextSelection(7);
    e.chain().focus().insertContent({ type: 'field', attrs: { key: 'employee.nameAr' } }).run();
    const doc = toStoredDocument(e.getJSON());
    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Name: ' },
        { type: 'field', attrs: { key: 'employee.nameAr' } },
      ],
    });
    // The stored text passes the API's own check.
    expect(checkEditorDocument(e.getJSON(), { requireContent: true }).ok).toBe(true);
  });

  it('edge case 8: "Optional phrase" around words with no field is refused — "An optional phrase needs a field"', () => {
    const e = make(paragraph({ type: 'text', text: 'in stage one' }));
    e.commands.setTextSelection({ from: 1, to: 9 });
    expect(toggleOptionalPhrase(e)).toBe('needsField');
    // Nothing changed.
    expect(JSON.stringify(e.getJSON())).not.toContain('optional');
  });

  it('wraps a selection holding a field in [ … ], and the stored document passes the check', () => {
    const e = make(paragraph({ type: 'text', text: ', in stage ' }, { type: 'field', attrs: { key: 'employee.stage' } }, { type: 'text', text: ' end' }));
    // ", in stage " (11 characters) + the chip (1).
    e.commands.setTextSelection({ from: 1, to: 13 });
    expect(toggleOptionalPhrase(e)).toBeNull();
    const doc = toStoredDocument(e.getJSON());
    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'optional', content: [{ type: 'text', text: ', in stage ' }, { type: 'field', attrs: { key: 'employee.stage' } }] },
        { type: 'text', text: ' end' },
      ],
    });
    expect(checkEditorDocument(e.getJSON()).ok).toBe(true);
  });

  it('refuses an empty selection, and one spanning two paragraphs', () => {
    const e = make({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'one ' }, { type: 'field', attrs: { key: 'today' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      ],
    });
    e.commands.setTextSelection(2);
    expect(toggleOptionalPhrase(e)).toBe('optionalSelect');
    e.commands.setTextSelection({ from: 1, to: 10 });
    expect(toggleOptionalPhrase(e)).toBe('optionalOneLine');
  });

  it('edge case 22: a typed {{name}} stays plain text, and a pasted foreign span is not a field', () => {
    const e = make(paragraph({ type: 'text', text: 'x' }));
    e.commands.setContent('<p>Dear {{name}} <span data-field="not.a.field">X</span> <span data-field="employee.code">C</span></p>');
    const doc = toStoredDocument(e.getJSON());
    const inline = (doc.content[0] as { content: { type: string; attrs?: { key: string } }[] }).content;
    expect(inline.filter((n) => n.type === 'field').map((n) => n.attrs?.key)).toEqual(['employee.code']);
    expect(JSON.stringify(doc)).toContain('{{name}}');
  });

  it('edge case 22: a paste from Word keeps only what the schema allows (no strike, code, quotes or images)', () => {
    const e = make(paragraph({ type: 'text', text: 'x' }));
    e.commands.setContent(
      '<h4>Clause</h4><blockquote><p>Quoted</p></blockquote><p><s>gone</s> <code>c</code> <b>bold</b><img src="x.png"></p>',
    );
    const stored = toStoredDocument(e.getJSON());
    const json = JSON.stringify(stored);
    expect(json).not.toMatch(/strike|code|blockquote|image/);
    expect(json).toContain('"bold"');
    expect(checkEditorDocument(e.getJSON()).ok).toBe(true);
  });
});
