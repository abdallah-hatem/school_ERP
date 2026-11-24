'use client';

import {
  contractYearOf,
  formatContractYear,
  renderContractDocument,
  settingsHref,
  type Contract,
  type ContractCopy,
  type ContractDocument,
  type ContractFieldKey,
  type ContractLanguage,
  type ContractPrintPreview,
  type ContractPrintTemplateOption,
} from '@school-erp/shared';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { Combobox } from '@/shared/components/ui/combobox';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
import {
  ContractFieldIcon,
  EditIcon,
  InfoIcon,
  PdfIcon,
  PrintIcon,
  ShareIcon,
  WarningIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@/shared/components/ui/icons';
import { Sheet, SheetContent, SheetTitle } from '@/shared/components/ui/sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { PICKER_PAGE, useServerOptions } from '@/shared/hooks/use-server-options';
import { TABLET_UP, useMediaQuery } from '@/shared/hooks/use-media-query';
import { saveDownloadedFile } from '@/shared/lib/download';
import { formatCount, formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { DocumentPages } from '../../contract-templates/components/document-pages';
import { EditorCanvasSkeleton } from '../../contract-templates/components/editor-skeleton';
import { FieldsPanel } from '../../contract-templates/components/fields-panel';
import { LanguageSwitch } from '../../contract-templates/components/language-switch';
import type { DocumentEditorHandle } from '../../contract-templates/editor/document-editor';
import { checkEditorDocument, toStoredDocument } from '../../contract-templates/lib/editor-json';
import { templateErrorText } from '../../contract-templates/lib/errors';
import { fieldName, SCHOOL_SETTING_FIELDS } from '../../contract-templates/lib/fields';
import { CREATE_CONTRACT_COPY, GET_CONTRACT_COPY_FILE, GET_CONTRACT_PRINT, GET_PRINT_TEMPLATES } from '../apis';
import { pdfBlob, printPdf, sharePdf } from '../lib/pdf-output';
import { CopiesList } from './contract-copies';

// TipTap only loads when "Edit text" opens (spec → Module placement).
const DocumentEditor = dynamic(() => import('../../contract-templates/editor/document-editor').then((m) => m.DocumentEditor), {
  ssr: false,
  loading: () => <EditorCanvasSkeleton />,
});

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25] as const;

type Load = { key: string; preview?: ContractPrintPreview; error?: string; code?: string };
type Ready = { copy: ContractCopy; blob: Blob };

/** The contract a dialog prints: a row's, or its renewal's next one (HR → Contracts). */
export type PrintableContract = Pick<Contract, 'id' | 'startsOn' | 'endsOn'> & { employee: Pick<Contract['employee'], 'id' | 'code' | 'nameEn' | 'nameAr'> };

/**
 * Print contract (spec → Screens, Printing; mockup A `a-*-desktop-print.png`, `a-*-phone-print.png`).
 * The filled A4 pages — the shared renderer and print CSS, so the preview is the PDF — beside the
 * template (the work system's default preselected; greyed "Needs access to salaries"), the copy's
 * language (English only when the template has English text), what prints empty or is left out,
 * "Edit text" for this copy only, and what is kept. Print / Download PDF has the API make the PDF
 * and keep the copy; a stale preview (409) reloads, keeping this copy's text edits unless the
 * template's text itself changed. A phone shows it full screen and hands the PDF to the share sheet.
 */
export function PrintContractDialog({
  contract,
  open,
  onOpenChange,
}: {
  contract: PrintableContract;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, has, locale } = useTranslation();
  const can = useCan();
  const router = useRouter();
  const wide = useMediaQuery(TABLET_UP, true);
  const [template, setTemplate] = useState<ContractPrintTemplateOption | null>(null);
  // null until the picker's first page is in: whether the work system has a default.
  const [noDefault, setNoDefault] = useState<boolean | null>(null);
  const [language, setLanguage] = useState<ContractLanguage>('AR');
  const [reload, setReload] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const [edited, setEdited] = useState<ContractDocument | null>(null);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [zoom, setZoom] = useState<number>(0.8);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageInView, setPageInView] = useState(1);
  const [making, setMaking] = useState<'PRINT' | 'PDF' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [templateChanged, setTemplateChanged] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const draft = useRef<unknown>(null);
  const editorRef = useRef<DocumentEditorHandle | null>(null);
  const seen = useRef(new Map<string, ContractPrintTemplateOption>());
  const seq = useRef(0);
  const templateLabelId = useId();
  const name = localName(contract.employee, locale);

  const optionOf = (o: ContractPrintTemplateOption) => ({
    value: o.id,
    label: [
      localName(o, locale),
      o.isDefault ? t('contractTemplates.print.default') : null,
      o.salaryBlocked ? t('contractTemplates.print.needsSalary') : null,
    ]
      .filter(Boolean)
      .join(' · '),
    disabled: o.salaryBlocked,
  });
  const templates = useServerOptions<ContractPrintTemplateOption>({
    load: async (search) => {
      const res = await GET_PRINT_TEMPLATES(contract.id, { search, limit: PICKER_PAGE });
      if (res.success) for (const o of res.data ?? []) seen.current.set(o.id, o);
      return res;
    },
    toOption: optionOf,
    selected: template ? optionOf(template) : null,
  });

  // On opening: the work system's default, preselected (none → the dialog asks to pick one).
  useEffect(() => {
    if (!open) return;
    let live = true;
    void callApi(GET_PRINT_TEMPLATES(contract.id, { limit: PICKER_PAGE }), { showErrorToast: false }).then((res) => {
      if (!live || !res.success) return;
      const list = res.data ?? [];
      for (const o of list) seen.current.set(o.id, o);
      const preferred = list.find((o) => o.isDefault && !o.salaryBlocked) ?? null;
      setTemplate((current) => current ?? preferred);
      setNoDefault(!preferred);
    });
    return () => {
      live = false;
    };
  }, [open, contract.id]);

  const shownLanguage: ContractLanguage = template && !template.hasEnglish ? 'AR' : language;
  const key = template ? `${template.id}:${shownLanguage}:${reload}` : null;

  useEffect(() => {
    if (!open || !template || !key) return;
    const n = ++seq.current;
    void callApi(GET_CONTRACT_PRINT(contract.id, template.id, shownLanguage), { showErrorToast: false }).then((res) => {
      if (n !== seq.current || res.unauthorized) return;
      if (res.success && res.data) {
        setLoad({ key, preview: res.data });
        return;
      }
      if (res.error === 'NO_ENGLISH_TEXT') setLanguage('AR');
      setLoad({ key, code: typeof res.error === 'string' ? res.error : undefined, error: templateErrorText(res, { t, has, locale }, t('contractTemplates.print.loadFailed')) });
    });
    // `key` names the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const preview = load?.preview ?? null;
  const loading = !!key && load?.key !== key;
  const rendered = useMemo(() => {
    if (!preview) return null;
    return renderContractDocument(edited ?? preview.document, {
      language: preview.language,
      values: preview.values,
      highlight: true,
      // The note is in the screen's language (the PDF never shows it).
      leftOutText: (keys) => t('contractTemplates.print.leftOutMark', { names: names(keys, locale === 'ar' ? 'AR' : 'EN') }),
      letterhead: { logoSrc: preview.logoUrl },
    });
  }, [preview, edited, t, locale]);

  function chooseTemplate(id: string) {
    const option = seen.current.get(id) ?? null;
    if (!option || option.salaryBlocked) return;
    if (option.id !== template?.id) {
      setEdited(null);
      setEditing(false);
    }
    setTemplate(option);
    setNotice(null);
  }

  function chooseLanguage(next: ContractLanguage) {
    if (next === shownLanguage) return;
    // Each language is its own text: this copy's edits were made on the other one.
    setEdited(null);
    setEditing(false);
    setLanguage(next);
  }

  function finishEditing() {
    if (draft.current === null || !preview) {
      setEditing(false);
      return;
    }
    const checked = checkEditorDocument(draft.current);
    if (!checked.ok) {
      setEditError(t(`errors.${checked.problem}`));
      return;
    }
    const same = JSON.stringify(checked.document) === JSON.stringify(toStoredDocument(preview.document));
    setEdited(same ? null : checked.document);
    setEditError(null);
    setEditing(false);
  }

  async function make(output: 'PRINT' | 'PDF') {
    if (!preview || !template || making) return;
    setMaking(output);
    setNotice(null);
    setReady(null);
    try {
      const res = await callApi(
        CREATE_CONTRACT_COPY(contract.id, {
          templateId: preview.template.id,
          templateVersion: preview.template.version,
          language: preview.language,
          valuesHash: preview.valuesHash,
          ...(edited ? { bodyEdited: edited } : {}),
          output,
        }),
        { showErrorToast: false },
      );
      if (res.unauthorized) return;
      if (!res.success || !res.data) {
        if (res.error === 'TEMPLATE_CHANGED' && edited) {
          setTemplateChanged(true);
          return;
        }
        setNotice({ tone: 'error', text: templateErrorText(res, { t, has, locale }, t('errors.INTERNAL_ERROR')) });
        // A stale preview reloads; this copy's text edits stay (edge case 15).
        if (res.error === 'VALUES_CHANGED' || res.error === 'TEMPLATE_CHANGED') setReload((r) => r + 1);
        return;
      }
      const copy = res.data;
      router.refresh();
      setReload((r) => r + 1);
      const file = copy.fileUrl ? await GET_CONTRACT_COPY_FILE(copy.fileUrl) : null;
      if (!file || !file.success || !file.data || !copy.fileUrl) {
        setNotice({ tone: 'info', text: t('contractTemplates.print.done') });
        return;
      }
      if (output === 'PDF') {
        saveDownloadedFile({ ...file.data, fileName: copy.downloadName });
        await callApi(Promise.resolve({ success: true as const, status: 200 }), {
          showSuccessToast: true,
          successMessage: t('contractTemplates.print.done'),
        });
        return;
      }
      const blob = pdfBlob(file.data);
      if (!wide) {
        const outcome = await sharePdf(blob, copy.downloadName, copy.fileUrl);
        if (outcome === 'needsTap' || outcome === 'blocked') setReady({ copy, blob });
        return;
      }
      const printed = await printPdf(blob, copy.fileUrl);
      if (printed === 'blocked') setReady({ copy, blob });
    } finally {
      setMaking(null);
    }
  }

  const contractYear = formatContractYear(contractYearOf(contract.startsOn));
  const subtitle = t('contractTemplates.print.subtitle', {
    name,
    code: contract.employee.code,
    start: formatDate(contract.startsOn, locale),
    end: formatDate(contract.endsOn, locale),
  });
  const busy = making !== null;
  const canPrint = !!preview && !!rendered && !loading && !editing && !busy;
  const pages = pageCount ?? 0;

  // ── The side panel ──────────────────────────────────────────────────────
  const empty = rendered ? rendered.emptyFields : [];
  const emptyRecord = empty.filter((k) => !SCHOOL_SETTING_FIELDS.includes(k));
  const emptySchool = [
    ...new Set([...empty, ...(rendered?.phrasesLeftOut.flat() ?? [])].filter((k) => SCHOOL_SETTING_FIELDS.includes(k))),
  ];
  const lang = preview?.language ?? shownLanguage;
  const screenLang: ContractLanguage = locale === 'ar' ? 'AR' : 'EN';

  const pickers = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span id={templateLabelId} className="text-sm font-semibold">
          {t('contractTemplates.print.template')}
        </span>
        <Combobox
          aria-labelledby={templateLabelId}
          value={template?.id ?? null}
          onValueChange={chooseTemplate}
          placeholder={t('contractTemplates.print.templatePick')}
          searchPlaceholder={t('contractTemplates.print.templateSearch')}
          emptyText={t('contractTemplates.print.templateNone')}
          noMatchesText={t('contractTemplates.print.templateNoMatches')}
          server={templates}
          disabled={busy}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t('contractTemplates.print.language')}</span>
        <LanguageSwitch
          value={shownLanguage}
          onChange={chooseLanguage}
          available={template && !template.hasEnglish ? ['AR'] : ['AR', 'EN']}
          label={t('contractTemplates.print.language')}
          className="w-fit"
        />
        {template && !template.hasEnglish ? (
          <span className="text-xs text-muted-foreground">{t('contractTemplates.print.englishMissing')}</span>
        ) : null}
      </div>
    </div>
  );

  const warnings: ReactNode[] = [];
  if (preview && rendered) {
    if (emptyRecord.length) {
      warnings.push(
        <Note key="empty" tone="warning">
          <strong className="block font-bold">
            {t('contractTemplates.print.emptyFields', { count: emptyRecord.length, names: names(emptyRecord, screenLang) })}
          </strong>
          {t('contractTemplates.print.emptyHint', { name })}{' '}
          <Link href={`/${locale}/employees/${contract.employee.id}`} className="font-bold underline underline-offset-2">
            {t('contractTemplates.print.openFile')}
          </Link>
        </Note>,
      );
    }
    if (emptySchool.length) {
      warnings.push(
        <Note key="school" tone="warning">
          <strong className="block font-bold">{t('contractTemplates.print.notSet', { names: names(emptySchool, screenLang) })}</strong>
          {can('core.settings.edit') ? (
            <Link href={settingsHref(locale, 'school')} className="font-bold underline underline-offset-2">
              {t('contractTemplates.print.openSettings')}
            </Link>
          ) : (
            t('contractTemplates.print.askAdmin')
          )}
        </Note>,
      );
    }
    for (const [i, group] of rendered.phrasesLeftOut.entries()) {
      const others = group.filter((k) => !SCHOOL_SETTING_FIELDS.includes(k));
      if (!others.length) continue;
      warnings.push(
        <Note key={`left-${i}`} tone="warning">
          {t('contractTemplates.print.leftOut', { names: names(others, screenLang) })}
        </Note>,
      );
    }
    if (preview.contract.endedOn) {
      warnings.push(
        <Note key="ended" tone="info">
          {t('contractTemplates.print.ended', { date: formatDate(preview.contract.endedOn, locale) })}
        </Note>,
      );
    }
  }

  const wording = (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t('contractTemplates.print.wording')}</h3>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted p-3">
        <EditIcon className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {edited ? t('contractTemplates.print.edited') : t('contractTemplates.print.wordingBody')}
        </p>
        <Button size="sm" variant="secondary" disabled={!preview || busy} onClick={() => setEditing(true)}>
          {t('contractTemplates.print.editText')}
        </Button>
      </div>
      {edited ? (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setEdited(null)}>
          {t('contractTemplates.print.undoEdits')}
        </Button>
      ) : null}
    </section>
  );

  const kept = (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t('contractTemplates.print.kept')}</h3>
      <p className="rounded-2xl bg-info-soft p-3 text-sm text-info-ink">
        {t('contractTemplates.print.keptBody', { name, year: contractYear })}
      </p>
      {preview ? (
        preview.copies.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{t('contractTemplates.print.earlier')}</span>
            <CopiesList copies={preview.copies} compact />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t('contractTemplates.print.earlierNone')}</span>
        )
      ) : null}
    </section>
  );

  // ── The pages (or the copy's editor) ────────────────────────────────────
  let stage: ReactNode;
  if (!template && noDefault === null) {
    stage = <Skeleton className="mx-auto aspect-[210/297] w-full max-w-[34rem] rounded-md" />;
  } else if (!template) {
    stage = (
      <p className="m-auto max-w-sm rounded-2xl bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {noDefault ? t('contractTemplates.print.noDefault') : t('contractTemplates.print.pickFirst')}
      </p>
    );
  } else if (load?.key === key && load.error) {
    stage = <ErrorState title={load.error} onRetry={load.code ? undefined : () => setReload((r) => r + 1)} />;
  } else if (editing && preview) {
    stage = (
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-info-soft px-3.5 py-2.5 text-sm text-info-ink">
          <InfoIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{t('contractTemplates.print.editCopy.note')}</span>
          <Button size="sm" variant="primary" onClick={finishEditing}>
            {t('contractTemplates.print.editCopy.done')}
          </Button>
        </div>
        {editError ? (
          <p role="alert" className="rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm font-semibold text-destructive-ink">
            {editError}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <DocumentEditor
            initial={edited ?? preview.document}
            language={preview.language}
            values={preview.values}
            label={t('contractTemplates.print.editCopy.title')}
            reflow={!wide}
            handleRef={(h) => {
              editorRef.current = h;
            }}
            onReady={(json) => {
              draft.current = json;
            }}
            onChange={(json) => {
              draft.current = json;
            }}
            toolbarEnd={
              <Button size="sm" variant="soft" onMouseDown={(e) => e.preventDefault()} onClick={() => setFieldsOpen(true)}>
                <ContractFieldIcon />
                {t('contractTemplates.editor.toolbar.insertField')}
              </Button>
            }
          />
        </div>
      </div>
    );
  } else if (rendered) {
    stage = (
      <DocumentPages
        html={rendered.html}
        zoom={zoom}
        fit={!wide}
        dimmed={loading}
        onPages={setPageCount}
        onPageInView={setPageInView}
        className="py-1"
      />
    );
  } else {
    stage = <Skeleton className="mx-auto aspect-[210/297] w-full max-w-[34rem] rounded-md" />;
  }

  const zoomIndex = ZOOMS.findIndex((z) => z === zoom);
  const pagesBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3 text-sm">
      <span className="font-semibold tabular-nums" aria-live="polite">
        {pages ? t('contractTemplates.print.page', { page: formatCount(Math.min(pageInView, pages)), count: formatCount(pages) }) : ' '}
      </span>
      <span className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-primary-soft ring-1 ring-primary/30" />
          {t('contractTemplates.print.filledIn')}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-accent-soft ring-1 ring-accent" />
          {t('contractTemplates.print.emptyField')}
        </span>
        <span className="flex items-center rounded-lg bg-card shadow-xs ring-1 ring-border max-md:hidden">
          <button
            type="button"
            aria-label={t('contractTemplates.print.zoomOut')}
            disabled={zoomIndex <= 0}
            onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)]!)}
            className="tap-target grid size-8 cursor-pointer place-items-center rounded-s-lg hover:bg-muted disabled:opacity-40"
          >
            <ZoomOutIcon className="size-4" />
          </button>
          <span className="w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label={t('contractTemplates.print.zoomIn')}
            disabled={zoomIndex >= ZOOMS.length - 1}
            onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)]!)}
            className="tap-target grid size-8 cursor-pointer place-items-center rounded-e-lg hover:bg-muted disabled:opacity-40"
          >
            <ZoomInIcon className="size-4" />
          </button>
        </span>
      </span>
    </div>
  );

  const makingLabel = t('contractTemplates.print.making');
  const footer = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground max-md:hidden" data-testid="print-page-count">
        {pages ? t('contractTemplates.print.pages', { count: pages }) : null}
      </span>
      <span className="flex-1 max-md:hidden" />
      <Button variant="ghost" className="max-md:hidden" onClick={() => onOpenChange(false)}>
        {t('common.actions.cancel')}
      </Button>
      <Button variant="secondary" className="max-md:hidden" disabled={!canPrint} loading={making === 'PDF'} onClick={() => void make('PDF')}>
        <PdfIcon />
        {making === 'PDF' ? makingLabel : t('contractTemplates.print.download')}
      </Button>
      <Button variant="primary" className="max-md:hidden" disabled={!canPrint} loading={making === 'PRINT'} onClick={() => void make('PRINT')}>
        <PrintIcon />
        {making === 'PRINT' ? makingLabel : t('contractTemplates.print.print')}
      </Button>
      {/* Phone: Edit text and "Print or PDF" (the share sheet). */}
      <div className="grid w-full grid-cols-2 gap-2 md:hidden">
        {editing ? (
          <Button variant="primary" className="col-span-2" onClick={finishEditing}>
            {t('contractTemplates.print.editCopy.done')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" disabled={!preview || busy} onClick={() => setEditing(true)}>
              <EditIcon />
              {t('contractTemplates.print.editText')}
            </Button>
            <Button variant="primary" disabled={!canPrint} loading={making !== null} onClick={() => void make('PRINT')}>
              <PrintIcon />
              {making ? makingLabel : t('contractTemplates.print.printOrPdf')}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        size="xl"
        title={editing && !wide ? t('contractTemplates.print.editCopy.title') : t('contractTemplates.print.title')}
        description={subtitle}
        closeLabel={t('common.actions.close')}
        footer={footer}
        className={cn(
          'sm:max-w-6xl md:h-[calc(100dvh-2rem)]',
          // A phone: the whole screen.
          'max-md:inset-0 max-md:top-0 max-md:h-dvh max-md:max-h-dvh max-md:max-w-none max-md:translate-y-0 max-md:rounded-none max-md:border-0',
        )}
      >
        <div data-skeleton-block="print-dialog" className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
            {pickers}
            {warnings.length ? <div className="flex flex-col gap-2">{warnings}</div> : null}
            {notice ? (
              <Note tone={notice.tone === 'error' ? 'error' : 'info'} role={notice.tone === 'error' ? 'alert' : 'status'}>
                {notice.text}
              </Note>
            ) : null}
            {ready ? <ReadyNote ready={ready} wide={wide} onShared={() => setReady(null)} /> : null}
            <div className="flex flex-col gap-4 max-md:hidden">
              {wording}
              {kept}
            </div>
          </div>
          <div className="flex min-w-0 flex-col rounded-2xl bg-muted p-3 sm:p-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {editing ? null : pagesBar}
            {stage}
          </div>
          <div className="md:hidden">{kept}</div>
        </div>
      </DialogContent>
      <Sheet open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <SheetContent side={wide ? 'end' : 'bottom'} className={wide ? undefined : 'h-[85dvh]'}>
          <div className="flex items-center justify-between px-4 pt-4">
            <SheetTitle className="font-display text-lg font-extrabold">{t('contractTemplates.editor.fields.sheetTitle')}</SheetTitle>
          </div>
          <FieldsPanel
            documentLanguage={lang}
            sheet
            className="min-h-0 flex-1"
            onInsert={(k) => {
              editorRef.current?.insertField(k);
              setFieldsOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
      <Dialog open={templateChanged} onOpenChange={setTemplateChanged}>
        <DialogContent
          size="sm"
          title={t('contractTemplates.print.templateChanged.title')}
          description={t('contractTemplates.print.templateChanged.body')}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setTemplateChanged(false);
                  onOpenChange(false);
                }}
              >
                {t('contractTemplates.print.templateChanged.close')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  // The edits were made on the old text: drop them and load the new one.
                  setEdited(null);
                  setEditing(false);
                  setTemplateChanged(false);
                  setReload((r) => r + 1);
                }}
              >
                {t('contractTemplates.print.templateChanged.restart')}
              </Button>
            </>
          }
        />
      </Dialog>
    </Dialog>
  );

  function names(keys: readonly ContractFieldKey[], language: ContractLanguage): string {
    return keys.map((k) => fieldName(k, language)).join(language === 'AR' ? '، ' : ', ');
  }
}

function Note({
  tone,
  role,
  children,
}: {
  tone: 'warning' | 'info' | 'error';
  role?: 'alert' | 'status';
  children: ReactNode;
}) {
  const Icon = tone === 'info' ? InfoIcon : WarningIcon;
  return (
    <div
      role={role}
      className={cn(
        'flex gap-2.5 rounded-2xl px-3.5 py-3 text-sm',
        tone === 'warning' && 'bg-accent-soft text-accent-foreground',
        tone === 'info' && 'bg-info-soft text-info-ink',
        tone === 'error' && 'bg-destructive-soft font-semibold text-destructive-ink',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

/** The PDF is made and kept, but the browser wants a tap to share it, or blocked the new tab. */
function ReadyNote({ ready, wide, onShared }: { ready: Ready; wide: boolean; onShared: () => void }) {
  const { t } = useTranslation();
  const canShare =
    !wide &&
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([ready.blob], ready.copy.downloadName, { type: 'application/pdf' })] });
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl bg-success-soft p-3.5 text-sm text-success-ink">
      <strong className="font-bold">{t('contractTemplates.print.ready')}</strong>
      <span>{t('contractTemplates.print.readyBody')}</span>
      <div className="flex flex-wrap gap-2">
        {canShare ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              void sharePdf(ready.blob, ready.copy.downloadName, ready.copy.fileUrl ?? '').then((outcome) => {
                if (outcome === 'shared' || outcome === 'opened') onShared();
              });
            }}
          >
            <ShareIcon />
            {t('contractTemplates.print.share')}
          </Button>
        ) : null}
        {ready.copy.fileUrl ? (
          <Button asChild size="sm" variant="secondary">
            <a href={ready.copy.fileUrl} target="_blank" rel="noreferrer">
              <PdfIcon />
              {t('contractTemplates.print.openPdf')}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
