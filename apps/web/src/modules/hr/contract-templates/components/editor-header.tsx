'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/shared/components/layout/page-header';
import { ChevronStartIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** The editor's header: the back link, the name, its pills, "Last changed …" and the buttons. */
export function TemplateEditorHeader({
  listHref,
  title,
  status,
  description,
  actions,
}: {
  listHref: string;
  title: ReactNode;
  status: ReactNode;
  description: ReactNode;
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={listHref}
        data-skeleton-block="back-link"
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
      >
        <ChevronStartIcon className="flip-rtl size-4" />
        {t('contractTemplates.editor.back')}
      </Link>
      <PageHeader title={title} status={status} description={description} actions={actions} />
    </div>
  );
}

