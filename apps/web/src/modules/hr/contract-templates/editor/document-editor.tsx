'use client';

import type { ContractDocument, ContractFieldKey, ContractFieldValues, ContractLanguage } from '@school-erp/shared';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  NumberedListIcon,
  OptionalPhraseIcon,
  PageBreakIcon,
  RedoIcon,
  TableIcon,
  UnderlineIcon,
  UndoIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { ContractDocumentStyles } from '../components/document-pages';
import { ChipContext, EDITOR_CSS, FieldNode, OptionalNode, PageBreakNode } from './nodes';
import { toggleOptionalPhrase, type OptionalRefusal } from './optional';

/*
 * The Word-style editor (spec → Screens, mockup A): TipTap 3 on the shared document schema — the
 * StarterKit's paragraphs, headings 1–3, bold / italic / underline, lists and hard breaks (code,
 * quotes, strike, rules and links switched off, so a paste from Word keeps only what the schema
 * allows: edge case 22), alignment, tables, and our field chip, optional phrase and page break.
 * The canvas wears the shared `.cd-doc` CSS, so the text looks as it will print. Loaded with
 * `next/dynamic` only by the template editor and the print dialog's "Edit text".
 */

export interface DocumentEditorHandle {
  /** Puts a field chip at the cursor (the Fields panel). */
  insertField: (key: ContractFieldKey) => void;
  focus: () => void;
}

export interface DocumentEditorProps {
  /** The starting text; the editor owns it afterwards (`onChange` reports each change). */
  initial: ContractDocument;
  /** The document's language: its direction and its chips' names. */
  language: ContractLanguage;
  /** "Edit this copy": the chips show these values (still locked). */
  values?: Partial<ContractFieldValues> | null;
  /** Each change, as TipTap's JSON (`toStoredDocument` cleans it). */
  onChange: (json: unknown) => void;
  /** Once created: its first JSON (the baseline for "unsaved changes"). */
  onReady?: (json: unknown) => void;
  handleRef?: Ref<DocumentEditorHandle>;
  /** Before the formatting buttons: the document language switch. */
  toolbarStart?: ReactNode;
  /** After them: Insert field. */
  toolbarEnd?: ReactNode;
  /** The canvas's accessible name. */
  label: string;
  /** Hidden (the other language's text stays mounted, with its own undo history). */
  hidden?: boolean;
  /** A phone: the canvas reflows to the width instead of the A4 sheet. */
  reflow?: boolean;
  className?: string;
}

export function DocumentEditor({
  initial,
  language,
  values = null,
  onChange,
  onReady,
  handleRef,
  toolbarStart,
  toolbarEnd,
  label,
  hidden = false,
  reflow = false,
  className,
}: DocumentEditorProps) {
  const { t } = useTranslation();
  const dir = language === 'AR' ? 'rtl' : 'ltr';
  const [refusal, setRefusal] = useState<OptionalRefusal | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    // The toolbar reads its state through `useEditorState`; the canvas needn't re-render per key.
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        blockquote: false,
        strike: false,
        horizontalRule: false,
        link: false,
        heading: { levels: [1, 2, 3] },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: t('contractTemplates.editor.placeholder') }),
      FieldNode,
      OptionalNode,
      PageBreakNode,
    ],
    content: initial as unknown as Record<string, unknown>,
    editorProps: {
      attributes: {
        class: 'cd-doc ce-root',
        dir,
        lang: language === 'AR' ? 'ar' : 'en',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
      },
    },
    onCreate: ({ editor: e }) => onReady?.(e.getJSON()),
    onUpdate: ({ editor: e }) => {
      setRefusal(null);
      onChange(e.getJSON());
    },
  });

  useImperativeHandle(
    handleRef,
    () => ({
      insertField: (key) => {
        if (!editor) return;
        editor.chain().focus().insertContent({ type: 'field', attrs: { key } }).run();
      },
      focus: () => editor?.commands.focus(),
    }),
    [editor],
  );

  // Labels follow the screen's language even when it switches.
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: { class: 'cd-doc ce-root', dir, lang: language === 'AR' ? 'ar' : 'en', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label },
      },
    });
  }, [editor, dir, language, label]);

  return (
    <ChipContext.Provider value={{ language, values, pageBreakLabel: t('contractTemplates.editor.pageBreak') }}>
      <div hidden={hidden} className={cn('flex min-w-0 flex-col', className)} data-editor-language={language}>
        <ContractDocumentStyles />
        <style href="contract-editor-css" precedence="default">
          {EDITOR_CSS}
        </style>
        <Toolbar editor={editor} start={toolbarStart} end={toolbarEnd} dir={dir} onRefuse={setRefusal} copyMode={values !== null} />
        {refusal ? (
          <p role="alert" className="mx-3 mt-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-semibold text-warning-ink">
            {refusal === 'needsField' ? t('errors.OPTIONAL_PHRASE_NEEDS_FIELD') : t(`contractTemplates.editor.${refusal}`)}
          </p>
        ) : null}
        <div
          data-skeleton-block="editor-canvas"
          data-skeleton-measure="width"
          className={cn('min-w-0 flex-1', reflow ? 'p-3' : 'overflow-x-auto bg-muted px-4 py-6 sm:px-8')}
        >
          <div
            className={cn(
              'mx-auto bg-card',
              reflow ? 'rounded-2xl border border-border p-4' : 'min-h-[297mm] w-[210mm] max-w-full p-[20mm] shadow-card ring-1 ring-border',
            )}
            onClick={(e) => {
              // A click on the sheet's margin puts the cursor in the text.
              if (e.target === e.currentTarget) editor?.commands.focus('end');
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </ChipContext.Provider>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

const STYLES = ['normal', 'heading1', 'heading2', 'heading3'] as const;
type Style = (typeof STYLES)[number];

function ToolButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
  className,
}: {
  icon: AppIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text's selection: the button acts on it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'tap-target grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-foreground transition-colors duration-150',
        'hover:bg-muted focus-visible:outline-3 focus-visible:outline-ring/55 disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-primary-soft text-primary hover:bg-primary-soft',
        className,
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />;

function Toolbar({
  editor,
  start,
  end,
  dir,
  onRefuse,
  copyMode,
}: {
  editor: Editor | null;
  start?: ReactNode;
  end?: ReactNode;
  dir: 'rtl' | 'ltr';
  onRefuse: (r: OptionalRefusal) => void;
  copyMode: boolean;
}) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const style: Style = e.isActive('heading', { level: 1 })
        ? 'heading1'
        : e.isActive('heading', { level: 2 })
          ? 'heading2'
          : e.isActive('heading', { level: 3 })
            ? 'heading3'
            : 'normal';
      const align = (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? null;
      return {
        style,
        align,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        ordered: e.isActive('orderedList'),
        table: e.isActive('table'),
        optional: e.isActive('optional'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
  const tb = (key: string) => t(`contractTemplates.editor.toolbar.${key}`);
  const chain = () => editor!.chain().focus();
  // Start / end follow the text's direction: Arabic starts on the right.
  const startAlign = dir === 'rtl' ? 'right' : 'left';
  const endAlign = dir === 'rtl' ? 'left' : 'right';
  const aligns = [
    { value: startAlign, label: tb('alignStart'), icon: dir === 'rtl' ? AlignRightIcon : AlignLeftIcon },
    { value: 'center', label: tb('alignCenter'), icon: AlignCenterIcon },
    { value: endAlign, label: tb('alignEnd'), icon: dir === 'rtl' ? AlignLeftIcon : AlignRightIcon },
    { value: 'justify', label: tb('alignJustify'), icon: AlignJustifyIcon },
  ] as const;
  const currentAlign = aligns.find((a) => a.value === state?.align) ?? aligns[0];
  const disabled = !editor;

  function setStyle(style: Style) {
    if (!editor) return;
    if (style === 'normal') chain().setParagraph().run();
    else chain().setHeading({ level: Number(style.slice(-1)) as 1 | 2 | 3 }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label={tb('label')}
      data-skeleton-block="editor-toolbar"
      className="scrollbar-clean flex min-h-14 items-center gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2"
    >
      {start ? (
        <>
          {start}
          <Divider />
        </>
      ) : null}
      <ToolButton icon={UndoIcon} label={tb('undo')} disabled={disabled || !state?.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton
        icon={RedoIcon}
        label={tb('redo')}
        disabled={disabled || !state?.canRedo}
        onClick={() => chain().redo().run()}
        className="max-sm:hidden"
      />
      <Divider />
      <Select value={state?.style ?? 'normal'} onValueChange={(v) => setStyle(v as Style)} disabled={disabled}>
        <SelectTrigger aria-label={tb('style')} className="h-9 w-36 shrink-0 max-sm:hidden" onMouseDown={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STYLES.map((s) => (
            <SelectItem key={s} value={s}>
              {tb(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ToolButton icon={BoldIcon} label={tb('bold')} active={state?.bold} disabled={disabled} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={ItalicIcon} label={tb('italic')} active={state?.italic} disabled={disabled} onClick={() => chain().toggleItalic().run()} />
      <ToolButton
        icon={UnderlineIcon}
        label={tb('underline')}
        active={state?.underline}
        disabled={disabled}
        onClick={() => chain().toggleUnderline().run()}
      />
      <Divider />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={currentAlign.label}
            title={currentAlign.label}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            className="tap-target grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-primary-soft text-primary transition-colors hover:bg-primary-soft/70 focus-visible:outline-3 focus-visible:outline-ring/55 disabled:opacity-40"
          >
            <currentAlign.icon className="size-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="flex gap-1 p-1.5" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
          {aligns.map((a) => (
            <ToolButton
              key={a.value}
              icon={a.icon}
              label={a.label}
              active={a.value === currentAlign.value}
              onClick={() => chain().setTextAlign(a.value).run()}
            />
          ))}
        </PopoverContent>
      </Popover>
      <ToolButton
        icon={NumberedListIcon}
        label={tb('numbered')}
        active={state?.ordered}
        disabled={disabled}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolButton
        icon={TableIcon}
        label={tb('table')}
        active={state?.table}
        disabled={disabled || state?.table}
        onClick={() => chain().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).run()}
      />
      <ToolButton icon={PageBreakIcon} label={tb('pageBreak')} disabled={disabled} onClick={() => chain().insertContent({ type: 'pageBreak' }).run()} />
      {copyMode ? null : (
        <ToolButton
          icon={OptionalPhraseIcon}
          label={tb('optional')}
          active={state?.optional}
          disabled={disabled}
          onClick={() => {
            if (!editor) return;
            const refused = toggleOptionalPhrase(editor);
            if (refused) onRefuse(refused);
          }}
        />
      )}
      {state?.table ? (
        <>
          <Divider />
          <TableTools editor={editor!} />
        </>
      ) : null}
      {end ? <div className="ms-auto flex shrink-0 items-center ps-2">{end}</div> : null}
    </div>
  );
}

function TableTools({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const items = [
    { key: 'addRow', run: () => editor.chain().focus().addRowAfter().run() },
    { key: 'addColumn', run: () => editor.chain().focus().addColumnAfter().run() },
    { key: 'deleteRow', run: () => editor.chain().focus().deleteRow().run() },
    { key: 'deleteColumn', run: () => editor.chain().focus().deleteColumn().run() },
    { key: 'deleteTable', run: () => editor.chain().focus().deleteTable().run() },
  ];
  return (
    <span className="flex shrink-0 items-center gap-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={item.run}
          className="h-9 shrink-0 cursor-pointer rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {t(`contractTemplates.editor.toolbar.${item.key}`)}
        </button>
      ))}
    </span>
  );
}
