'use client';

import { useState } from 'react';
import { CONTRACT_COPIES_SHOWN, schoolDayOf, type ContractCopy } from '@school-erp/shared';
import { LockedIcon, OpenIcon, PdfIcon } from '@/shared/components/ui/icons';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_CONTRACT_COPIES } from '../apis';

/**
 * A contract's printed copies (spec → Printed copies), newest first as the API sends them: "Printed
 * copy · 2 Jun 2025 · Full-time contract v3 · Mona Ibrahim", "Text edited" and "Signed" badges, and
 * **Open** — the kept PDF, byte for byte. A copy holding a salary the reader can't see comes without
 * its file (`fileUrl` null): "contains salary", no Open.
 */
export function CopiesList({ copies, compact = false, className }: { copies: readonly ContractCopy[]; compact?: boolean; className?: string }) {
  const { t, locale } = useTranslation();
  return (
    <ul className={cn('flex flex-col gap-1.5', className)} data-testid="contract-copies">
      {copies.map((copy) => {
        // The day it was printed at the school (Cairo), not in UTC.
        const date = formatDate(schoolDayOf(new Date(copy.printedAt)), locale);
        return (
          <li
            key={copy.id}
            className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted px-3 py-2 text-xs', compact && 'bg-card ring-1 ring-border')}
          >
            <PdfIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 basis-48 break-words text-foreground">
              {t('contractTemplates.copies.line', {
                date,
                template: localName({ nameEn: copy.templateNameEn, nameAr: copy.templateNameAr }, locale),
                version: copy.templateVersion,
                name: copy.printedBy.name,
              })}
            </span>
            {copy.textEdited ? <StatusPill tone="info">{t('contractTemplates.copies.textEdited')}</StatusPill> : null}
            {copy.signed ? <StatusPill tone="success">{t('contractTemplates.copies.signed')}</StatusPill> : null}
            {copy.fileUrl ? (
              <a
                href={copy.fileUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t('contractTemplates.copies.openLabel', { date })}
                className="tap-target inline-flex cursor-pointer items-center gap-1 rounded-sm font-semibold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
              >
                <OpenIcon className="size-4 shrink-0" />
                {t('contractTemplates.copies.open')}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <LockedIcon className="size-4 shrink-0" />
                {t('contractTemplates.copies.containsSalary')}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Under a contract on the employee's Contracts tab: its newest printed copies, when it has any, and
 * "Show N more" for the rest — each press asks the API for the next page (never sliced here).
 */
export function ContractCopiesBlock({
  contractId,
  copies,
  total,
}: {
  contractId: string;
  copies: readonly ContractCopy[] | undefined;
  total?: number;
}) {
  const { t } = useTranslation();
  const [more, setMore] = useState<ContractCopy[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  if (!copies?.length) return null;
  const shown = copies.length + more.length;
  const left = Math.max(0, (total ?? copies.length) - shown);
  async function loadMore() {
    setLoading(true);
    try {
      // Pages of the shown size: page 1 is what the row already holds.
      const next = page + 1;
      const res = await GET_CONTRACT_COPIES(contractId, { page: next, limit: CONTRACT_COPIES_SHOWN });
      if (res.success && res.data) {
        setMore((m) => [...m, ...res.data!]);
        setPage(next);
      }
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <span className="text-xs font-semibold text-muted-foreground">{t('contractTemplates.copies.title')}</span>
      <CopiesList copies={[...copies, ...more]} />
      {left > 0 ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className="self-start text-xs font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {t('contractTemplates.copies.showMore', { count: left })}
        </button>
      ) : null}
    </div>
  );
}
