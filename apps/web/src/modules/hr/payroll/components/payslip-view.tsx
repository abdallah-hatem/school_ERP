'use client';

import { AdjustmentType, PayrollFlag, type Payslip } from '@school-erp/shared';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmployeeLink } from '@/core/employees';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Button } from '@/shared/components/ui/button';
import { Days, Money } from '@/shared/components/ui/figures';
import { ChevronStartIcon, PayslipIcon, PrintIcon } from '@/shared/components/ui/icons';
import { Skeleton, SkeletonText } from '@/shared/components/ui/skeleton';
import { apiErrorText } from '@/shared/lib/api-error';
import { formatCount, formatDate, formatDayCount, formatMonth } from '@/shared/lib/format';
import { localName, nameIn } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * Print rules for the payslip: one A4 page, no app chrome (the shell's `no-print` parts and this
 * page's buttons), no page background, figures kept black on white.
 */
export const PAYSLIP_PRINT_CSS = `@page { size: A4 portrait; margin: 12mm; }
@media print {
  html, body { background: var(--card) !important; }
  main { padding: 0 !important; }
  [data-payslip] { box-shadow: none !important; border: 0 !important; padding: 0 !important; max-width: none !important; break-inside: avoid; }
}`;

/**
 * The payslip of one line of an approved run (§6): school, month, employee, salary for the month,
 * each penalty (zero-amount ones too) with its share of the deduction, lateness, adjustments, net.
 * In the page's language; prints on one A4 page.
 */
export function PayslipView({ payslip, backHref }: { payslip: Payslip; backHref: string }) {
  const { t, locale } = useTranslation();
  const monthLabel = formatMonth(payslip.month, locale);
  const additions = payslip.adjustments.filter((a) => a.type === AdjustmentType.ADDITION);

  return (
    <div className="flex flex-col gap-5">
      <style>{PAYSLIP_PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="cursor-pointer">
          <Link href={backHref}>
            <ChevronStartIcon className="flip-rtl" />
            {t('payroll.actions.backToRun')}
          </Link>
        </Button>
        <Button variant="primary" className="cursor-pointer" onClick={() => window.print()}>
          <PrintIcon />
          {t('payroll.actions.print')}
        </Button>
      </div>

      <article
        data-payslip=""
        aria-label={t('payroll.payslip.title')}
        className="bg-card shadow-card mx-auto flex w-full max-w-[210mm] flex-col gap-4 rounded-3xl p-5 text-sm md:p-8 print:gap-3 print:text-xs"
      >
        <header className="border-border flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="flex min-w-0 items-center gap-3">
            {payslip.school.logoUrl ? (
              <Image
                src={payslip.school.logoUrl}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="size-12 shrink-0 rounded-xl object-contain"
              />
            ) : (
              <span className="bg-primary-soft text-primary grid size-12 shrink-0 place-items-center rounded-xl">
                <PayslipIcon className="size-7" />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight font-extrabold break-words">
                {nameIn(payslip.school, locale) || t('ui.shell.productName')}
              </p>
              <p className="text-muted-foreground">{t('payroll.payslip.title')}</p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-muted-foreground text-xs">{t('payroll.payslip.month')}</p>
            <p className="font-display text-lg font-extrabold">{monthLabel}</p>
          </div>
        </header>

        <section className="flex flex-col gap-2">
          <h1 className="font-display text-xl leading-tight font-extrabold break-words">
            <EmployeeLink employeeId={payslip.employeeId} name={localName(payslip, locale)} />
          </h1>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3">
            <Field label={t('payroll.payslip.code')}>
              <bdi dir="ltr" className="tabular">
                {payslip.employeeCode}
              </bdi>
            </Field>
            <Field label={t('payroll.payslip.nationalId')}>
              <bdi dir="ltr" className="tabular">
                {payslip.nationalId ?? '—'}
              </bdi>
            </Field>
            <Field label={t('payroll.payslip.department')}>
              {locale === 'ar' ? payslip.departmentNameAr : payslip.departmentNameEn}
            </Field>
            <Field label={t('payroll.payslip.workSystem')}>{t(`common.enums.workSystem.${payslip.workSystem}`)}</Field>
            <Field label={t('payroll.payslip.basicSalary')}>
              <Money value={payslip.basicSalary} />
            </Field>
            <Field label={t('payroll.payslip.dayValue')}>
              <Money value={payslip.dayValue} />
            </Field>
          </dl>
        </section>

        <Section title={t('payroll.payslip.salary')}>
          <Row label={t('payroll.payslip.monthSalary')}>
            <Money value={payslip.monthSalary} className="font-bold" />
          </Row>
        </Section>

        <Section title={t('payroll.payslip.penalties')}>
          {payslip.penalties.length === 0 ? (
            <p className="text-muted-foreground">{t('payroll.payslip.noPenalties')}</p>
          ) : (
            <>
              {/* Phones: one stacked block per penalty. From `sm` up, and always in print: the table. */}
              <ul data-penalty-list="" className="flex flex-col gap-2 sm:hidden print:hidden">
                {payslip.penalties.map((p, i) => (
                  <li
                    key={`${p.date}-${i}`}
                    data-testid="payslip-penalty-stacked"
                    className="bg-muted flex flex-col gap-1.5 rounded-xl px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-semibold break-words">
                        {locale === 'ar' ? p.violationNameAr : p.violationNameEn}
                      </span>
                      <Money
                        value={p.amount}
                        currency={false}
                        className={cn('shrink-0 font-bold', (p.amount ?? 0) > 0 ? 'text-destructive-ink' : 'text-muted-foreground')}
                      />
                    </div>
                    <p className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                      <bdi className="tabular">{formatDate(p.date, locale)}</bdi>
                      <span aria-hidden="true">·</span>
                      <span>{t('payroll.payslip.level', { level: p.level })}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t(`common.enums.penaltyAction.${p.action}`)}</span>
                      {p.days === null ? null : (
                        <>
                          <span aria-hidden="true">·</span>
                          <Days value={p.days} />
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="scrollbar-clean hidden overflow-x-auto sm:block print:block">
                <table className="w-full border-separate border-spacing-0" aria-label={t('payroll.payslip.penalties')}>
                  <thead>
                    <tr className="text-muted-foreground text-xs">
                      <Th>{t('payroll.payslip.penaltyColumns.date')}</Th>
                      <Th>{t('payroll.payslip.penaltyColumns.violation')}</Th>
                      <Th>{t('payroll.payslip.penaltyColumns.level')}</Th>
                      <Th>{t('payroll.payslip.penaltyColumns.action')}</Th>
                      <Th end>{t('payroll.payslip.penaltyColumns.days')}</Th>
                      <Th end>{t('payroll.payslip.penaltyColumns.amount')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslip.penalties.map((p, i) => (
                      <tr key={`${p.date}-${i}`} data-testid="payslip-penalty">
                        <Td>
                          <bdi className="tabular">
                            {formatDate(p.date, locale)}
                          </bdi>
                        </Td>
                        <Td wrap>{locale === 'ar' ? p.violationNameAr : p.violationNameEn}</Td>
                        <Td>{t('payroll.payslip.level', { level: p.level })}</Td>
                        <Td wrap>{t(`common.enums.penaltyAction.${p.action}`)}</Td>
                        <Td end>{p.days === null ? '—' : <Days value={p.days} unit={false} />}</Td>
                        <Td end>
                          <Money
                            value={p.amount}
                            currency={false}
                            className={(p.amount ?? 0) > 0 ? 'text-destructive-ink' : 'text-muted-foreground'}
                          />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground text-xs">{t('payroll.payslip.penaltyShareNote')}</p>
            </>
          )}
          <Row label={t('payroll.payslip.totalPenalties')}>
            <Money
              value={payslip.penaltyAmount}
              className={(payslip.penaltyAmount ?? 0) > 0 ? 'text-destructive-ink font-bold' : 'font-bold'}
            />
          </Row>
        </Section>

        <Section title={t('payroll.payslip.lateness')}>
          <Row
            label={t('payroll.payslip.latenessDetail', {
              count: formatCount(payslip.latenessMinutes),
              days: formatDayCount(payslip.latenessDays, locale),
            })}
          >
            <Money
              value={payslip.latenessAmount}
              className={(payslip.latenessAmount ?? 0) > 0 ? 'text-destructive-ink font-bold' : 'font-bold'}
            />
          </Row>
        </Section>

        <Section title={t('payroll.payslip.adjustments')}>
          {payslip.adjustments.length === 0 ? (
            <p className="text-muted-foreground">{t('payroll.payslip.noAdjustments')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {payslip.adjustments.map((a, i) => (
                <li key={i} data-testid="payslip-adjustment" className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words">
                    <span className="font-semibold">{t(`common.enums.adjustmentType.${a.type}`)}</span>
                    <span aria-hidden="true"> · </span>
                    <BidiText className="text-muted-foreground">{a.reason}</BidiText>
                  </span>
                  <Money
                    value={a.type === AdjustmentType.DEDUCTION && a.amount !== undefined ? -a.amount : a.amount}
                    className={a.type === AdjustmentType.DEDUCTION ? 'text-destructive-ink' : 'text-success-ink'}
                  />
                </li>
              ))}
            </ul>
          )}
          {additions.length > 0 ? (
            <Row label={t('payroll.payslip.totalAdditions')}>
              <Money value={payslip.adjustmentAdditions} className="text-success-ink font-bold" />
            </Row>
          ) : null}
          {(payslip.adjustmentDeductions ?? 0) > 0 ? (
            <Row label={t('payroll.payslip.totalDeductions')}>
              <Money value={payslip.adjustmentDeductions} className="text-destructive-ink font-bold" />
            </Row>
          ) : null}
        </Section>

        <div className="bg-primary text-primary-foreground print:border-foreground print:bg-card print:text-foreground flex flex-wrap items-baseline justify-between gap-2 rounded-2xl px-5 py-4 print:border">
          <span className="font-display text-lg font-extrabold">{t('payroll.payslip.net')}</span>
          <Money value={payslip.net} className="text-2xl font-extrabold" />
        </div>
        {payslip.flags.includes(PayrollFlag.NET_FLOORED) ? (
          <p className="text-warning-ink text-xs">{t('payroll.payslip.netFloored')}</p>
        ) : null}
        <p className="text-muted-foreground hidden text-xs print:block">{t('payroll.payslip.printNote')}</p>
      </article>
    </div>
  );
}

/**
 * The payslip while it loads: the same buttons, A4 card, header, employee fields, sections and net
 * band (the usual case — no penalties, no adjustments), with bars in place of the figures.
 */
export function PayslipSkeleton() {
  const { t } = useTranslation();
  const amount = <SkeletonText className="font-bold" width="w-24" />;
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-11 w-36 rounded-lg" />
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <div
        aria-hidden="true"
        className="bg-card shadow-card mx-auto flex w-full max-w-[210mm] flex-col gap-4 rounded-3xl p-5 text-sm md:p-8"
      >
        <div className="border-border flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <SkeletonText className="font-display text-lg leading-tight font-extrabold" width="w-44" />
              <p className="text-muted-foreground">{t('payroll.payslip.title')}</p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-muted-foreground text-xs">{t('payroll.payslip.month')}</p>
            <SkeletonText className="font-display text-lg font-extrabold" width="w-32" />
          </div>
        </div>
        <section className="flex flex-col gap-2">
          <SkeletonText className="font-display text-xl leading-tight font-extrabold" width="w-56" />
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(['code', 'nationalId', 'department', 'workSystem', 'basicSalary', 'dayValue'] as const).map((key) => (
              <Field key={key} label={t(`payroll.payslip.${key}`)}>
                <SkeletonText width="w-24" />
              </Field>
            ))}
          </dl>
        </section>
        <Section title={t('payroll.payslip.salary')}>
          <Row label={t('payroll.payslip.monthSalary')}>{amount}</Row>
        </Section>
        <Section title={t('payroll.payslip.penalties')}>
          <SkeletonText width="w-40" />
          <Row label={t('payroll.payslip.totalPenalties')}>{amount}</Row>
        </Section>
        <Section title={t('payroll.payslip.lateness')}>
          <Row label={t('payroll.payslip.lateness')}>{amount}</Row>
        </Section>
        <Section title={t('payroll.payslip.adjustments')}>
          <SkeletonText width="w-40" />
        </Section>
        <div className="bg-primary text-primary-foreground flex flex-wrap items-baseline justify-between gap-2 rounded-2xl px-5 py-4">
          <span className="font-display text-lg font-extrabold">{t('payroll.payslip.net')}</span>
          <SkeletonText className="text-2xl font-extrabold" width="w-40" barClassName="bg-primary-foreground/20" />
        </div>
      </div>
    </div>
  );
}

/** A draft run has no payslips yet (409 `PAYROLL_NOT_APPROVED`): say so and lead back to the run. */
export function PayslipUnavailable({
  error,
  message,
  backHref,
}: {
  error?: string;
  message: string;
  backHref: string;
}) {
  const { t, has } = useTranslation();
  return (
    <div className="bg-card shadow-card rounded-3xl">
      <EmptyState
        icon={PayslipIcon}
        title={t('payroll.payslip.draftTitle')}
        description={apiErrorText({ error, message }, { t, has })}
        action={
          <Button asChild variant="primary" className="cursor-pointer">
            <Link href={backHref}>{t('payroll.actions.backToRun')}</Link>
          </Button>
        }
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-muted print:bg-card flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 print:px-0 print:py-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 font-semibold break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border flex flex-col gap-2 border-t pt-3">
      <h2 className="font-display text-base font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Th({ children, end = false }: { children: ReactNode; end?: boolean }) {
  return (
    <th
      className={cn(
        'border-border border-b px-2 py-1.5 font-semibold whitespace-nowrap first:ps-0 last:pe-0',
        end ? 'text-end' : 'text-start',
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, end = false, wrap = false }: { children: ReactNode; end?: boolean; wrap?: boolean }) {
  return (
    <td
      className={cn(
        'border-border border-b px-2 py-1.5 align-top first:ps-0 last:pe-0',
        end ? 'text-end' : 'text-start',
        wrap ? 'break-words' : 'whitespace-nowrap',
      )}
    >
      {children}
    </td>
  );
}
