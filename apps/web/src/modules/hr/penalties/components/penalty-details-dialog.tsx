'use client';

import { PenaltyStatus, type PenaltyRecord } from '@school-erp/shared';
import type { ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { formatDate } from '@/shared/lib/format';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { EmployeeIdentity } from '../../employees';
import { approveBlockedReason, deductsPay, describeAction, penaltyStepLines } from '../lib/penalty-text';
import { cn } from '@/shared/lib/utils';
import { PenaltyActions } from './penalty-actions';
import { PenaltyStatusPill } from './penalties-table';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * One penalty over the list — what a notification's link opens (`?penalty=<id>`, §11): who, when,
 * which violation, the level and action, its status, and the same approve / cancel actions as the
 * row's menu (each only with its permission). After an action the page refreshes and the dialog
 * shows the record as it now is. Closing it drops `?penalty` from the URL. A penalty waiting for an
 * earlier one of the same violation (§4 approve in date order) says so above the footer, where its
 * disabled Approve points (`aria-describedby`).
 */
export function PenaltyDetailsDialog({
  record,
  onClose,
}: {
  record: PenaltyRecord | undefined;
  onClose: () => void;
}) {
  const { t, locale } = useTranslation();
  const blocked = record && !record.ownPenalty ? approveBlockedReason(record, t, locale) : null;
  return (
    <Dialog open={!!record} onOpenChange={(open) => (open ? undefined : onClose())}>
      {record ? (
        <DialogContent
          size="md"
          title={t('penalties.details.title')}
          closeLabel={t('ui.dialog.close')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary" className="cursor-pointer">
                  {t('ui.dialog.close')}
                </Button>
              </DialogClose>
              <PenaltyActions record={record} variant="buttons" />
            </>
          }
        >
          <div data-testid="penalty-details" className="flex flex-col gap-4">
            <EmployeeIdentity employee={record.employee} size="lg" />
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('penalties.columns.date')}>
                <bdi className="tabular">{formatDate(record.date, locale)}</bdi>
              </Field>
              <Field label={t('penalties.columns.status')}>
                <span className="flex flex-col items-start gap-1">
                  <PenaltyStatusPill status={record.status} />
                  {record.status === PenaltyStatus.CANCELLED && record.cancelReason ? (
                    <span className="text-xs text-muted-foreground">
                      <BidiText>{record.cancelReason}</BidiText>
                    </span>
                  ) : null}
                </span>
              </Field>
              <Field label={t('penalties.columns.violation')}>{nameIn(record.violation, locale)}</Field>
              <Field label={t('penalties.details.stage')}>{nameIn(record.stage, locale)}</Field>
              <Field label={t('penalties.columns.levelAction')}>
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{t('penalties.levelValue', { level: record.level })}</span>
                  <span className={deductsPay(record.action.effect, record) ? 'font-semibold text-destructive-ink' : undefined}>
                    {describeAction(t, locale, record.action, record)}
                  </span>
                </span>
              </Field>
              {record.note ? (
                <div className="sm:col-span-2">
                  <Field label={t('penalties.details.note')}>
                    <BidiText>{record.note}</BidiText>
                  </Field>
                </div>
              ) : null}
            </dl>
            <section aria-labelledby={`penalty-${record.id}-steps`} className="flex flex-col gap-2">
              <h3 id={`penalty-${record.id}-steps`} className="text-xs font-semibold text-muted-foreground">
                {t('penalties.steps.title')}
              </h3>
              <ol data-testid="penalty-steps" className="flex flex-col gap-2.5">
                {penaltyStepLines(record, t, locale).map((line) => (
                  <li key={line.key} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2.5 shrink-0 rounded-full',
                        line.tone === 'done' && 'bg-success',
                        line.tone === 'waiting' && 'bg-warning',
                        line.tone === 'rejected' && 'bg-destructive',
                        line.tone === 'cancelled' && 'bg-muted-foreground',
                      )}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <span className="font-semibold break-words">
                        {line.text}
                        {line.at ? (
                          <>
                            {' · '}
                            <bdi className="tabular font-normal text-muted-foreground">{line.at}</bdi>
                          </>
                        ) : null}
                      </span>
                      {line.detail ? (
                        <span className="text-xs break-words text-muted-foreground">
                          <BidiText>{line.detail}</BidiText>
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            {blocked ? (
              <p
                id={`penalty-${record.id}-blocked`}
                data-testid="penalty-approve-blocked"
                className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-semibold text-warning-ink"
              >
                {blocked}
              </p>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
