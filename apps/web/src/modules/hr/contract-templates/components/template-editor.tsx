'use client';

import {
  emptyContractDocument,
  settingsHref,
  WORK_SYSTEMS,
  type ContractDocument,
  type ContractFieldKey,
  type ContractLanguage,
  type ContractTemplate,
  type WorkSystem,
} from '@school-erp/shared';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { callApi } from '@/lib/callApi';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { ContractFieldIcon, SaveIcon, ShowIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/shared/components/ui/sheet';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { useLeaveGuard } from '@/shared/hooks/use-leave-guard';
import { formatDateTime } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_CONTRACT_TEMPLATE, UPDATE_CONTRACT_TEMPLATE } from '../apis';
import type { DocumentEditorHandle } from '../editor/document-editor';
import { checkEditorDocument, isEmptyDocument, toStoredDocument } from '../lib/editor-json';
import { templateErrorText } from '../lib/errors';
import { EditorCanvasSkeleton } from './editor-skeleton';
import { TemplateEditorHeader } from './editor-header';
import { FieldsPanel } from './fields-panel';
import { LanguageSwitch } from './language-switch';
import { PreviewDialog } from './preview-dialog';

// TipTap stays out of every other page's bundle (spec → Module placement).
const DocumentEditor = dynamic(() => import('../editor/document-editor').then((m) => m.DocumentEditor), {
  ssr: false,
  loading: () => <EditorCanvasSkeleton />,
});

/** Name lengths (spec → Templates: up to 100 characters each). */
export const TEMPLATE_NAME_MAX = 100;

const NO_DEFAULT = 'none';

interface Meta {
  id: string | null;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

const asString = (doc: unknown) => JSON.stringify(toStoredDocument(doc));

/**
 * The template editor (spec → Screens; mockup A `a-*-editor.png`): names, the work system it is the
 * default for, the two texts (Arabic required, English optional — each its own document, edited in
 * its own direction), the Fields panel, "Preview with an employee" and Save. A save that changes a
 * text makes a new version; a stale one is refused (`TEMPLATE_CHANGED`) and says so. Leaving with
 * unsaved changes asks first. On a phone the fields open as a bottom sheet and a sticky bar saves.
 */
export function TemplateEditor({ template, listHref }: { template: ContractTemplate | null; listHref: string }) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const nameEnId = useId();
  const nameArId = useId();
  const defaultId = useId();
  const fieldsSearchId = useId();
  const [meta, setMeta] = useState<Meta>({
    id: template?.id ?? null,
    version: template?.version ?? 0,
    updatedAt: template?.updatedAt ?? null,
    updatedBy: template?.updatedBy?.name ?? null,
  });
  const initialNames = useMemo(
    () => ({ nameEn: template?.nameEn ?? '', nameAr: template?.nameAr ?? '', defaultFor: template?.defaultForWorkSystem ?? null }),
    [template],
  );
  const [savedNames, setSavedNames] = useState(initialNames);
  const [nameEn, setNameEn] = useState(initialNames.nameEn);
  const [nameAr, setNameAr] = useState(initialNames.nameAr);
  const [defaultFor, setDefaultFor] = useState<WorkSystem | null>(initialNames.defaultFor);
  const [language, setLanguage] = useState<ContractLanguage>('AR');
  const initialDocs = useMemo<Record<ContractLanguage, ContractDocument>>(
    () => ({ AR: template?.bodyAr ?? emptyContractDocument(), EN: template?.bodyEn ?? emptyContractDocument() }),
    [template],
  );
  // The editors' JSON now, and what was last saved (the "unsaved changes" baseline).
  const docs = useRef<Record<ContractLanguage, unknown>>({ AR: initialDocs.AR, EN: initialDocs.EN });
  const [baseline, setBaseline] = useState<Record<ContractLanguage, string | null>>({ AR: null, EN: null });
  const [current, setCurrent] = useState<Record<ContractLanguage, string | null>>({ AR: null, EN: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [previewing, setPreviewing] = useState<{ AR: ContractDocument; EN: ContractDocument | null } | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [leaving, setLeaving] = useState<string | (() => void) | null>(null);
  const editors = useRef<Record<ContractLanguage, DocumentEditorHandle | null>>({ AR: null, EN: null });

  const textsDirty = (['AR', 'EN'] as const).some((l) => current[l] !== null && baseline[l] !== null && current[l] !== baseline[l]);
  const dirty =
    nameEn.trim() !== savedNames.nameEn || nameAr.trim() !== savedNames.nameAr || defaultFor !== savedNames.defaultFor || textsDirty;
  const onLeaveAttempt = useCallback((target: string | (() => void)) => setLeaving(() => target), []);
  useLeaveGuard(dirty, onLeaveAttempt);

  const nameProblem = (value: string) =>
    value.trim() === '' ? t('ui.form.required') : value.trim().length > TEMPLATE_NAME_MAX ? t('contractTemplates.editor.nameMax') : null;
  const enProblem = touched ? nameProblem(nameEn) : null;
  const arProblem = touched ? nameProblem(nameAr) : null;

  const hasEnglish = current.EN !== null ? !isEmptyDocument(JSON.parse(current.EN) as ContractDocument) : !!template?.bodyEn;

  function readDocs(): { ok: true; AR: ContractDocument; EN: ContractDocument | null } | { ok: false; message: string } {
    const ar = checkEditorDocument(docs.current.AR, { requireContent: true });
    if (!ar.ok) return { ok: false, message: t(`errors.${ar.problem}`) };
    const enStored = toStoredDocument(docs.current.EN);
    if (isEmptyDocument(enStored)) return { ok: true, AR: ar.document, EN: null };
    const en = checkEditorDocument(docs.current.EN);
    if (!en.ok) return { ok: false, message: t(`errors.${en.problem}`) };
    return { ok: true, AR: ar.document, EN: en.document };
  }

  async function save() {
    setTouched(true);
    setError(null);
    if (nameProblem(nameEn) || nameProblem(nameAr)) {
      setError(t('contractTemplates.editor.nameRequired'));
      return;
    }
    const texts = readDocs();
    if (!texts.ok) {
      setError(texts.message);
      return;
    }
    setSaving(true);
    try {
      const body = { nameEn: nameEn.trim(), nameAr: nameAr.trim(), defaultForWorkSystem: defaultFor, bodyAr: texts.AR, bodyEn: texts.EN };
      const request = meta.id ? UPDATE_CONTRACT_TEMPLATE(meta.id, { ...body, baseVersion: meta.version }) : CREATE_CONTRACT_TEMPLATE(body);
      const first = await request;
      const took = first.success ? first.data?.tookDefaultFrom : null;
      const saved = first.success ? first.data?.template : null;
      const message = took && saved
        ? t('contractTemplates.list.tookDefault', { name: localName(saved, locale), other: localName(took, locale) })
        : meta.id
          ? t('contractTemplates.editor.saved')
          : t('contractTemplates.editor.created');
      const res = await callApi(Promise.resolve(first), { showErrorToast: false, showSuccessToast: true, successMessage: message });
      if (res.unauthorized) return;
      if (!res.success || !res.data) {
        setError(templateErrorText(res, { t, has, locale }, t('errors.INTERNAL_ERROR')));
        return;
      }
      const next = res.data.template;
      // What is on screen is now what is saved.
      setBaseline({ AR: asString(docs.current.AR), EN: asString(docs.current.EN) });
      setSavedNames({ nameEn: next.nameEn, nameAr: next.nameAr, defaultFor: next.defaultForWorkSystem });
      setMeta({ id: next.id, version: next.version, updatedAt: next.updatedAt, updatedBy: next.updatedBy?.name ?? null });
      if (!meta.id) router.replace(`${listHref.split('?')[0]}/contract-templates/${next.id}`);
      else router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function openPreview() {
    const ar = toStoredDocument(docs.current.AR);
    const en = toStoredDocument(docs.current.EN);
    setPreviewing({ AR: ar, EN: isEmptyDocument(en) ? null : en });
  }

  function insertField(key: ContractFieldKey) {
    editors.current[language]?.insertField(key);
    setFieldsOpen(false);
  }

  const title = meta.id ? localName({ nameEn: savedNames.nameEn, nameAr: savedNames.nameAr }, locale) : t('contractTemplates.editor.newTitle');
  const status = (
    <span className="flex flex-wrap items-center gap-2">
      {savedNames.defaultFor ? (
        <StatusPill tone="accent">
          {t('contractTemplates.editor.defaultPill', { workSystem: t(`common.enums.workSystem.${savedNames.defaultFor}`) })}
        </StatusPill>
      ) : null}
      <StatusPill tone="neutral">{t(`contractTemplates.languagePills.${hasEnglish ? 'both' : 'AR'}`)}</StatusPill>
    </span>
  );
  const description =
    meta.updatedAt && meta.updatedBy
      ? t('contractTemplates.editor.lastChanged', { when: formatDateTime(meta.updatedAt, locale), name: meta.updatedBy })
      : t('contractTemplates.editor.notSaved');

  const editorFor = (l: ContractLanguage) => (
    <DocumentEditor
      key={`${meta.id ?? 'new'}-${l}`}
      initial={initialDocs[l]}
      language={l}
      hidden={l !== language}
      label={t('contractTemplates.editor.canvasLabel', { language: t(`contractTemplates.languages.${l}`) })}
      handleRef={(h) => {
        editors.current[l] = h;
      }}
      onReady={(json) => {
        const s = asString(json);
        setBaseline((b) => ({ ...b, [l]: b[l] ?? s }));
        setCurrent((c) => ({ ...c, [l]: s }));
        docs.current[l] = json;
      }}
      onChange={(json) => {
        docs.current[l] = json;
        setCurrent((c) => ({ ...c, [l]: asString(json) }));
      }}
      toolbarStart={<LanguageSwitch value={language} onChange={setLanguage} size="sm" />}
      toolbarEnd={
        <Button
          size="sm"
          variant="soft"
          className="max-lg:hidden"
          onMouseDown={(e) => e.preventDefault()}
          // The panel is beside the text: its search takes the keyboard; a click on a field inserts it.
          onClick={() => document.getElementById(fieldsSearchId)?.focus()}
        >
          <ContractFieldIcon />
          {t('contractTemplates.editor.toolbar.insertField')}
        </Button>
      }
    />
  );

  return (
    <div className={cn('flex flex-col gap-5', dirty && 'max-lg:pb-24')}>
      <TemplateEditorHeader
        listHref={listHref}
        title={title}
        status={status}
        description={description}
        actions={
          <>
            <Button variant="secondary" onClick={openPreview}>
              <ShowIcon />
              {t('contractTemplates.editor.preview')}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              <SaveIcon />
              {t('contractTemplates.editor.save')}
            </Button>
          </>
        }
      />

      {error ? (
        <p role="alert" className="rounded-2xl bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive-ink">
          {error}
        </p>
      ) : null}

      <section data-skeleton-block="template-names" className="grid gap-4 rounded-3xl bg-card p-5 shadow-card md:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={nameEnId} className="text-sm font-semibold">
            {t('contractTemplates.editor.nameEn')}
            <span className="text-destructive-ink"> *</span>
          </label>
          <Input
            id={nameEnId}
            dir="ltr"
            value={nameEn}
            maxLength={TEMPLATE_NAME_MAX}
            placeholder={t('contractTemplates.editor.nameEnPlaceholder')}
            aria-invalid={enProblem ? true : undefined}
            onChange={(e) => setNameEn(e.target.value)}
          />
          {enProblem ? <span className="text-xs font-semibold text-destructive-ink">{enProblem}</span> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={nameArId} className="text-sm font-semibold">
            {t('contractTemplates.editor.nameAr')}
            <span className="text-destructive-ink"> *</span>
          </label>
          <Input
            id={nameArId}
            dir="rtl"
            value={nameAr}
            maxLength={TEMPLATE_NAME_MAX}
            placeholder={t('contractTemplates.editor.nameArPlaceholder')}
            aria-invalid={arProblem ? true : undefined}
            onChange={(e) => setNameAr(e.target.value)}
          />
          {arProblem ? <span className="text-xs font-semibold text-destructive-ink">{arProblem}</span> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={defaultId} className="text-sm font-semibold">
            {t('contractTemplates.editor.defaultFor')}
          </label>
          <Select value={defaultFor ?? NO_DEFAULT} onValueChange={(v) => setDefaultFor(v === NO_DEFAULT ? null : (v as WorkSystem))}>
            <SelectTrigger id={defaultId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DEFAULT}>{t('contractTemplates.editor.noDefault')}</SelectItem>
              {WORK_SYSTEMS.map((ws) => (
                <SelectItem key={ws} value={ws}>
                  {t(`common.enums.workSystem.${ws}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{t('contractTemplates.editor.defaultForHint')}</span>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div data-skeleton-block="editor-card" data-skeleton-measure="width" className="min-w-0 overflow-hidden rounded-3xl bg-card shadow-card">
          {editorFor('AR')}
          {editorFor('EN')}
          {language === 'EN' && !hasEnglish ? (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{t('contractTemplates.editor.englishEmpty')}</p>
          ) : null}
        </div>
        <aside className="max-lg:hidden lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-[52rem] lg:overflow-hidden lg:rounded-3xl lg:bg-card lg:shadow-card">
          <FieldsPanel documentLanguage={language} onInsert={insertField} className="h-full" searchId={fieldsSearchId} />
        </aside>
      </div>

      {/* Phone and tablet: the fields as a bottom sheet, from a floating "Field" button. */}
      <Button
        variant="primary"
        className={cn('fixed start-4 z-30 bg-accent text-accent-foreground shadow-raised hover:bg-accent/90 lg:hidden', dirty ? 'bottom-24' : 'bottom-6')}
        onClick={() => setFieldsOpen(true)}
      >
        <ContractFieldIcon />
        {t('contractTemplates.editor.fields.button')}
      </Button>
      <Sheet open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <SheetContent side="bottom" className="h-[85dvh]">
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-border" aria-hidden="true" />
          <div className="flex items-center justify-between px-4 pt-3">
            <SheetTitle className="font-display text-lg font-extrabold">{t('contractTemplates.editor.fields.sheetTitle')}</SheetTitle>
          </div>
          <FieldsPanel documentLanguage={language} onInsert={insertField} sheet className="min-h-0 flex-1" />
        </SheetContent>
      </Sheet>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-raised lg:hidden">
          <span role="status" className="text-sm text-muted-foreground">
            {t('contractTemplates.editor.unsavedBar')}
          </span>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            <SaveIcon />
            {t('common.actions.save')}
          </Button>
        </div>
      ) : null}

      {previewing ? (
        <PreviewDialog open onOpenChange={(o) => !o && setPreviewing(null)} documents={previewing} language={previewing.EN ? language : 'AR'} />
      ) : null}

      <ConfirmDialog
        open={leaving !== null}
        onOpenChange={(o) => !o && setLeaving(null)}
        title={t('contractTemplates.editor.unsaved.title')}
        description={t('contractTemplates.editor.unsaved.body')}
        confirmLabel={t('contractTemplates.editor.unsaved.discard')}
        tone="destructive"
        onConfirm={() => {
          const target = leaving;
          setLeaving(null);
          // Nothing to guard any more: the edits are being left behind.
          setSavedNames({ nameEn: nameEn.trim(), nameAr: nameAr.trim(), defaultFor });
          setBaseline({ ...current });
          if (typeof target === 'string') router.push(target);
          else target?.();
        }}
      />
    </div>
  );
}

/** Settings → Contract templates, the list the editor returns to. */
export function templatesListHref(locale: string): string {
  return settingsHref(locale, 'contractTemplates');
}
