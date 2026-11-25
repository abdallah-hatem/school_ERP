// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContractDocument, ContractLanguage, ContractTemplate } from '@school-erp/shared';
import { useEffect, useImperativeHandle, useState, type AnchorHTMLAttributes, type ReactNode, type Ref } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentEditorHandle } from '../editor/document-editor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; prefetch?: boolean }) => {
    const anchor = { ...props };
    delete anchor.prefetch;
    return <a {...anchor} />;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({ CREATE_CONTRACT_TEMPLATE: vi.fn(), UPDATE_CONTRACT_TEMPLATE: vi.fn(), GET_CONTRACT_TEMPLATE_PREVIEW: vi.fn() }));
vi.mock('../apis', () => api);
vi.mock('./preview-dialog', () => ({ PreviewDialog: () => null }));

/*
 * TipTap doesn't type in jsdom, so the dynamic editor is a plain text box with the same contract:
 * `onReady` / `onChange` report the document, the handle resets it (counting resets, standing in
 * for the cleared undo history). Its first report writes the keys in another order than later ones,
 * as TipTap and the stored `jsonb` do — the dirty check must compare content, not key order. Each
 * change also ends the text with an empty paragraph, as TipTap's trailing node does after a table.
 */
const editorLog = vi.hoisted(() => ({ resets: [] as string[], focused: [] as string[] }));
const textOf = (doc: ContractDocument) =>
  doc.content.map((b) => ('content' in b && b.content ? b.content.map((n) => ('text' in n ? n.text : '')).join('') : '')).join('\n');
const docOf = (text: string) => ({ type: 'doc', content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }] });
const reordered = (text: string) => ({ content: [text ? { content: [{ text, type: 'text' }], type: 'paragraph' } : { type: 'paragraph' }], type: 'doc' });

interface FakeEditorProps {
  initial: ContractDocument;
  language: ContractLanguage;
  label: string;
  onChange: (json: unknown) => void;
  onReady?: (json: unknown) => void;
  handleRef?: Ref<DocumentEditorHandle>;
  toolbarStart?: ReactNode;
}

function FakeEditor(props: FakeEditorProps) {
  const [text, setText] = useState(() => textOf(props.initial));
  useEffect(() => {
    props.onReady?.(reordered(textOf(props.initial)));
    // Once, like TipTap's onCreate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useImperativeHandle(props.handleRef, () => ({
    insertField: vi.fn(),
    focus: () => editorLog.focused.push(props.language),
    reset: (document) => {
      editorLog.resets.push(props.language);
      setText(textOf(document));
      return docOf(textOf(document));
    },
  }));
  return (
    <div>
      {props.toolbarStart}
      <textarea
        aria-label={props.label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = docOf(e.target.value);
          props.onChange({ ...next, content: [...next.content, { type: 'paragraph' }] });
        }}
      />
    </div>
  );
}
// Read at render, not when the mock is made (the mock is hoisted above this file's code).
vi.mock('next/dynamic', () => ({ default: () => (props: FakeEditorProps) => <FakeEditor {...props} /> }));

import { renderTemplates, sampleDocument, summary } from '../test/fixtures';
import { TemplateEditor } from './template-editor';

const englishDocument: ContractDocument = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fixed-term contract' }] }] };
const template: ContractTemplate = {
  ...summary({ hasEnglish: true }),
  bodyAr: sampleDocument,
  bodyEn: englishDocument,
  createdAt: '2026-11-01T09:00:00.000Z',
  createdBy: { id: 'u-1', name: 'Mona Ibrahim' },
};

const discardButton = () => screen.getByRole('button', { name: 'Discard changes' });
const arabicText = () => screen.getByRole('textbox', { name: 'Contract text in Arabic', hidden: true });
const englishText = () => screen.getByRole('textbox', { name: 'Contract text in English', hidden: true });

async function renderEditor(t: ContractTemplate | null = template) {
  const user = userEvent.setup();
  renderTemplates(<TemplateEditor template={t} listHref="/en/settings?section=contractTemplates" />);
  // Both editors are there (and reported their first text on mount).
  await waitFor(() => expect(screen.getAllByRole('textbox', { name: /^Contract text in /, hidden: true })).toHaveLength(2));
  return user;
}

describe('the template editor — Discard changes', () => {
  beforeEach(() => {
    editorLog.resets = [];
    editorLog.focused = [];
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('is disabled while nothing changed', async () => {
    await renderEditor();
    expect(discardButton()).toHaveProperty('disabled', true);
  });

  it('is enabled after a name edit', async () => {
    const user = await renderEditor();
    await user.type(screen.getByLabelText(/Name in English/), ' (2026)');
    expect(discardButton()).toHaveProperty('disabled', false);
  });

  it('is enabled after a text edit', async () => {
    const user = await renderEditor();
    await user.type(arabicText(), ' بند');
    expect(discardButton()).toHaveProperty('disabled', false);
  });

  it('stays disabled after typing and deleting back to the same text and name', async () => {
    const user = await renderEditor();
    await user.type(arabicText(), 'xy');
    expect(discardButton()).toHaveProperty('disabled', false);
    await user.type(arabicText(), '{Backspace}{Backspace}');
    const name = screen.getByLabelText(/Name in English/);
    await user.type(name, 'z{Backspace}');
    expect(discardButton()).toHaveProperty('disabled', true);
  });

  it('confirm puts the names, the default and both texts back, sends nothing and keeps the language tab', async () => {
    const user = await renderEditor();
    const nameEn = screen.getByLabelText(/Name in English/);
    const nameAr = screen.getByLabelText(/Name in Arabic/);
    await user.clear(nameEn);
    await user.type(nameEn, 'Changed');
    await user.type(nameAr, ' معدل');
    await user.click(screen.getByRole('combobox', { name: 'Default for' }));
    await user.click(await screen.findByRole('option', { name: 'Not a default' }));
    await user.type(arabicText(), ' بند');
    // The English text: switch the document language, edit, and stay on English.
    await user.click(screen.getAllByRole('radio', { name: 'English' })[0]!);
    await user.type(englishText(), ' amended');

    await user.click(discardButton());
    const dialog = screen.getByRole('dialog', { name: 'Discard your changes?' });
    expect(dialog.textContent).toContain('The template goes back to its last saved version.');
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText<HTMLInputElement>(/Name in English/).value).toBe('Full-time contract');
    expect(screen.getByLabelText<HTMLInputElement>(/Name in Arabic/).value).toBe('عقد عمل بدوام كامل');
    expect(screen.getByRole('combobox', { name: 'Default for' }).textContent).toContain('Full-time');
    expect(editorLog.resets.sort()).toEqual(['AR', 'EN']);
    expect((arabicText() as HTMLTextAreaElement).value).toBe(textOf(sampleDocument));
    expect((englishText() as HTMLTextAreaElement).value).toBe('Fixed-term contract');
    expect(discardButton()).toHaveProperty('disabled', true);
    // The tab stayed on English, and focus went back to its text.
    expect(screen.getAllByRole('radio', { name: 'English' })[0]!.getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(editorLog.focused).toContain('EN'));
    expect(api.UPDATE_CONTRACT_TEMPLATE).not.toHaveBeenCalled();
    expect(api.CREATE_CONTRACT_TEMPLATE).not.toHaveBeenCalled();
  });

  it('cancel keeps the edits', async () => {
    const user = await renderEditor();
    await user.type(screen.getByLabelText(/Name in English/), ' (2026)');
    await user.type(arabicText(), ' بند');
    await user.click(discardButton());
    const dialog = screen.getByRole('dialog', { name: 'Discard your changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText<HTMLInputElement>(/Name in English/).value).toBe('Full-time contract (2026)');
    expect((arabicText() as HTMLTextAreaElement).value).toBe(`${textOf(sampleDocument)} بند`);
    expect(editorLog.resets).toEqual([]);
    expect(discardButton()).toHaveProperty('disabled', false);
  });

  it('a new template goes back to empty', async () => {
    const user = await renderEditor(null);
    await user.type(screen.getByLabelText(/Name in English/), 'Annex');
    await user.type(arabicText(), 'نص');
    await user.click(discardButton());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText<HTMLInputElement>(/Name in English/).value).toBe('');
    expect((arabicText() as HTMLTextAreaElement).value).toBe('');
    expect(discardButton()).toHaveProperty('disabled', true);
  });
});
