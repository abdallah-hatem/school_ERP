'use client';

import { Skeleton, SkeletonButton, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { ContractFieldIcon, SaveIcon, ShowIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { settingsHref } from '@school-erp/shared';
import { ContractTemplatesI18n } from '../messages';
import { TemplateEditorHeader } from './editor-header';

/*
 * The template editor's loading shape (docs/ARCHITECTURE.md → Skeletons match their screens): the
 * back link, the header with its pills and two buttons, the names card, the toolbar over the A4
 * canvas, and the Fields panel — the same frames and `data-skeleton-block`s as the loaded page.
 */

/** The toolbar and the A4 sheet while TipTap's chunk loads (also the `next/dynamic` fallback). */
export function EditorCanvasSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col">
      <div data-skeleton-block="editor-toolbar" className="flex min-h-14 items-center gap-1 overflow-hidden border-b border-border bg-card px-3 py-2">
        <Skeleton className="h-10 w-44 shrink-0 rounded-xl" />
        <span className="mx-1 h-6 w-px shrink-0 bg-border" />
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="size-9 shrink-0 rounded-lg" />
        ))}
      </div>
      <div data-skeleton-block="editor-canvas" data-skeleton-measure="width" className="min-w-0 flex-1 overflow-x-auto bg-muted px-4 py-6 sm:px-8">
        <div className="mx-auto flex min-h-[297mm] w-[210mm] max-w-full flex-col gap-4 bg-card p-[20mm] shadow-card ring-1 ring-border">
          <SkeletonText className="mx-auto text-xl" width="w-56" />
          {[0, 1, 2, 3, 4, 5].map((p) => (
            <div key={p} className="flex flex-col gap-2">
              <SkeletonText width="w-full" />
              <SkeletonText width="w-11/12" />
              <SkeletonText width="w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldsPanelSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-hidden="true" data-skeleton-block="fields-panel" data-skeleton-measure="width" className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-display text-lg font-extrabold text-transparent">
            <ContractFieldIcon className="size-5 invisible" />
            <SkeletonText className="font-display text-lg" width="w-20" />
          </span>
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <SkeletonText className="text-sm" width="w-full" />
        <SkeletonText className="text-sm" width="w-2/3" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border-t border-border px-4 pt-4">
        <span className="sr-only">{t('ui.states.loading')}</span>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="flex flex-1 flex-col gap-1">
              <SkeletonText className="text-sm" width="w-36" />
              <SkeletonText className="text-xs" width="w-48" />
            </span>
            <Skeleton className="size-7 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The whole editor page while the template loads (the route's `loading.tsx`). */
export function TemplateEditorSkeleton({ listHref }: { listHref: string }) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      <TemplateEditorHeader
        listHref={listHref}
        title={<SkeletonText className="text-2xl md:text-3xl" width="w-64" />}
        status={
          <span className="flex flex-wrap items-center gap-2">
            <SkeletonPill>{t('contractTemplates.editor.defaultPill', { workSystem: t('common.enums.workSystem.FULL_TIME') })}</SkeletonPill>
            <SkeletonPill>{t('contractTemplates.languagePills.AR')}</SkeletonPill>
          </span>
        }
        description={<SkeletonText className="text-sm" width="w-72" />}
        actions={
          <>
            <SkeletonButton>
              <ShowIcon />
              {t('contractTemplates.editor.preview')}
            </SkeletonButton>
            <SkeletonButton>
              <SaveIcon />
              {t('contractTemplates.editor.save')}
            </SkeletonButton>
          </>
        }
      />
      <section aria-hidden="true" data-skeleton-block="template-names" className="grid gap-4 rounded-3xl bg-card p-5 shadow-card md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1.5">
            <SkeletonText className="text-sm" width="w-28" />
            <Skeleton className="h-11 w-full rounded-xl" />
            {i === 2 ? <SkeletonText className="text-xs" width="w-56" /> : null}
          </div>
        ))}
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div data-skeleton-block="editor-card" data-skeleton-measure="width" className="min-w-0 overflow-hidden rounded-3xl bg-card shadow-card">
          <EditorCanvasSkeleton />
        </div>
        <aside className="max-lg:hidden lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-[52rem] lg:overflow-hidden lg:rounded-3xl lg:bg-card lg:shadow-card">
          <FieldsPanelSkeleton />
        </aside>
      </div>
    </div>
  );
}

/** The editor routes' `loading.tsx`: the skeleton in the page's language. */
export function TemplateEditorLoading() {
  const { locale } = useTranslation();
  return (
    <ContractTemplatesI18n locale={locale}>
      <TemplateEditorSkeleton listHref={settingsHref(locale, 'contractTemplates')} />
    </ContractTemplatesI18n>
  );
}
