'use client';

import {
  renderContractDocument,
  type ContractDocument,
  type ContractLanguage,
  type ContractTemplatePreview,
  type EmployeeSummary,
} from '@school-erp/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { callApi } from '@/lib/callApi';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { Combobox, type ComboboxOption } from '@/shared/components/ui/combobox';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
import { InfoIcon } from '@/shared/components/ui/icons';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { PICKER_PAGE, useServerOptions } from '@/shared/hooks/use-server-options';
import { localName, nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_EMPLOYEES } from '../../employees/apis';
import { GET_CONTRACT_TEMPLATE_PREVIEW } from '../apis';
import { fieldName } from '../lib/fields';
import { DocumentPages } from './document-pages';
import { LanguageSwitch } from './language-switch';

type Answer = { key: string; preview?: ContractTemplatePreview; failed?: boolean };

/**
 * "Preview with an employee" (spec → Screens): pick an employee (the API searches by name or code)
 * and see the editor's text — saved or not — filled with their current contract, through the shared
 * renderer. Salary fields the viewer may not see show greyed "hidden". Nothing is kept or recorded.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  documents,
  language: initialLanguage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The editor's texts now: Arabic, and English when it has any. */
  documents: { AR: ContractDocument; EN: ContractDocument | null };
  language: ContractLanguage;
}) {
  const { t, locale } = useTranslation();
  // The chosen employee: its option (the API's answer for the typed text names it).
  const [employee, setEmployee] = useState<ComboboxOption | null>(null);
  const [language, setLanguage] = useState<ContractLanguage>(initialLanguage);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const seq = useRef(0);
  const shown: ContractLanguage = language === 'EN' && !documents.EN ? 'AR' : language;
  const [retry, setRetry] = useState(0);
  const key = employee ? `${employee.value}:${shown}` : null;

  const employees = useServerOptions<EmployeeSummary>({
    load: (search) => GET_EMPLOYEES({ search, limit: PICKER_PAGE }),
    toOption: (e) => ({ value: e.id, label: `${nameIn(e, locale)} · ${e.code}` }),
    selected: employee,
  });

  useEffect(() => {
    if (!open || !employee) return;
    const n = ++seq.current;
    const k = `${employee.value}:${shown}`;
    void callApi(GET_CONTRACT_TEMPLATE_PREVIEW(employee.value, shown), { showErrorToast: false }).then((res) => {
      if (n !== seq.current || res.unauthorized) return;
      setAnswer(res.success && res.data ? { key: k, preview: res.data } : { key: k, failed: true });
    });
  }, [open, employee, shown, retry]);

  const preview = answer?.preview;
  const rendered = useMemo(() => {
    if (!preview) return null;
    return renderContractDocument(shown === 'EN' && documents.EN ? documents.EN : documents.AR, {
      language: shown,
      values: preview.values,
      hidden: preview.hidden,
      hiddenText: t('contractTemplates.preview.hidden'),
      highlight: true,
      // The note is in the screen's language (the PDF never shows it).
      leftOutText: (keys) =>
        t('contractTemplates.print.leftOutMark', { names: keys.map((k) => fieldName(k, locale === 'ar' ? 'AR' : 'EN')).join(locale === 'ar' ? '، ' : ', ') }),
    });
  }, [preview, shown, documents, t, locale]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        title={t('contractTemplates.preview.title')}
        description={t('contractTemplates.preview.note')}
        closeLabel={t('common.actions.close')}
        className="sm:max-w-6xl"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
              <span className="text-sm font-semibold">{t('contractTemplates.preview.employee')}</span>
              <Combobox
                value={employee?.value ?? null}
                onValueChange={(id) => setEmployee(employees.options.find((o) => o.value === id) ?? null)}
                placeholder={t('contractTemplates.preview.pick')}
                searchPlaceholder={t('contractTemplates.preview.searchPlaceholder')}
                emptyText={t('contractTemplates.preview.empty')}
                noMatchesText={t('contractTemplates.preview.noMatches')}
                server={employees}
              />
            </label>
            {documents.EN ? <LanguageSwitch value={shown} onChange={setLanguage} available={['AR', 'EN']} /> : null}
          </div>
          {!employee ? (
            <p className="rounded-2xl bg-muted px-4 py-10 text-center text-sm text-muted-foreground">{t('contractTemplates.preview.pickFirst')}</p>
          ) : answer?.failed && answer.key === key ? (
            <ErrorState title={t('contractTemplates.print.loadFailed')} onRetry={() => setRetry((n) => n + 1)} />
          ) : rendered && preview ? (
            <>
              {preview.contract ? null : (
                <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info-ink">
                  <InfoIcon className="mt-0.5 size-4 shrink-0" />
                  {t('contractTemplates.preview.noContract', { name: localName(preview.employee, locale) })}
                </p>
              )}
              <div className="rounded-2xl bg-muted p-4">
                <DocumentPages html={rendered.html} fit dimmed={answer?.key !== key} />
              </div>
            </>
          ) : (
            <Skeleton className="mx-auto aspect-[210/297] w-full max-w-2xl rounded-md" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
