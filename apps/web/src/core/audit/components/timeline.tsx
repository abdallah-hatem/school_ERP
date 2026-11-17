'use client';

import { AUDIT_ACTIONS, isMoneyEntry, type AuditEntry, type IsoDate, type IsoDateTime } from '@school-erp/shared';
import Link from 'next/link';
import { Fragment, useId, useState, type ReactNode } from 'react';
import { EmployeeLink } from '@/core/employees';
import { Money } from '@/shared/components/ui/figures';
import {
  ApproveIcon,
  CancelledIcon,
  CoreModuleIcon,
  CreatedIcon,
  EditIcon,
  FailedSignInIcon,
  HrModuleIcon,
  MoneyIcon,
  OpenRecordIcon,
  PayrollIcon,
  ReactivateIcon,
  SettingsIcon,
  SignInIcon,
  SignOutIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';
import { Skeleton, SkeletonText } from '@/shared/components/ui/skeleton';
import { SlotText, TEXT_SLOT } from '@/shared/components/ui/slot-text';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  actorName,
  changeRows,
  entrySentence,
  formatAuditValue,
  isFailedSignIn,
  isMoneyField,
  labelIn,
  recordHref,
  type ChangeRow,
} from '../lib/entry-text';
import {
  formatDayHeading,
  formatMonthHeading,
  formatSchoolDateTime,
  formatSchoolTime,
  formatShortDay,
  relativeAgo,
  schoolDay,
  schoolMonth,
  addDays,
} from '../lib/time';

/*
 * The activity timeline (layout option B, design/mockups/audit-log.html): entries read as
 * sentences on a vertical line, grouped under day headers (Activity) or month headers (a record's
 * History), each with its first changed fields inline and "+ n more" to expand. The card it sits
 * in is a size container: below 34rem the time moves above the sentence (phone).
 */

export type TimelineGrouping = 'day' | 'month';

/** How many changed fields show before "+ n more". */
const INLINE_CHANGES = { day: 2, month: 4 } as const;

type Tone = 'neutral' | 'ok' | 'money' | 'failed';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  ok: 'bg-success-soft text-success',
  money: 'bg-info-soft text-info',
  failed: 'bg-warning-soft text-warning',
};

function entryLook(entry: AuditEntry): { icon: AppIcon; tone: Tone } {
  const verb = entry.action.split('.').pop() ?? '';
  if (isFailedSignIn(entry)) return { icon: FailedSignInIcon, tone: 'failed' };
  if (entry.action === 'core.auth.sign_in') return { icon: SignInIcon, tone: 'neutral' };
  if (entry.action === 'core.auth.sign_out') return { icon: SignOutIcon, tone: 'neutral' };
  const money = isMoneyEntry(entry);
  if (verb === 'approve') return { icon: ApproveIcon, tone: money ? 'money' : 'ok' };
  if (verb === 'cancel' || verb === 'deactivate') return { icon: CancelledIcon, tone: 'neutral' };
  if (verb === 'reactivate') return { icon: ReactivateIcon, tone: 'ok' };
  if (entry.entityType === 'payroll_run') return { icon: PayrollIcon, tone: 'money' };
  if (entry.entityType === 'school_settings' || entry.entityType === 'hr_settings') {
    return { icon: SettingsIcon, tone: money ? 'money' : 'neutral' };
  }
  if (AUDIT_ACTIONS[entry.action]?.kind === 'create') return { icon: CreatedIcon, tone: money ? 'money' : 'neutral' };
  return { icon: EditIcon, tone: money ? 'money' : 'neutral' };
}

/**
 * The sentence with the record's label in bold, isolated so a name in the other script reads right.
 * An employee's name opens their profile (`linkRecord`: not on History, where the record is the page).
 */
function Sentence({
  entry,
  lowerFirst = false,
  linkRecord = false,
}: {
  entry: AuditEntry;
  lowerFirst?: boolean;
  linkRecord?: boolean;
}) {
  const { t, locale } = useTranslation();
  const text = entrySentence({ action: entry.action, entityLabel: TEXT_SLOT }, t, locale);
  // English sentences start with a capital; after the actor's name ("Mona changed…") it is lowered.
  const sentence = lowerFirst ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  const label = <bdi className="font-bold">{labelIn(entry.entityLabel, locale)}</bdi>;
  return (
    <SlotText
      text={sentence}
      slot={linkRecord && entry.entityType === 'employee' ? <EmployeeLink employeeId={entry.entityId} name={label} /> : label}
    />
  );
}

/** Who did it: their name, which opens their profile when their account is linked to an employee. */
export function ActorName({ entry, className = 'font-extrabold' }: { entry: Pick<AuditEntry, 'actor'>; className?: string }) {
  const { t } = useTranslation();
  const name = <bdi className={className}>{actorName(entry, t)}</bdi>;
  const employeeId = entry.actor?.employeeId;
  return employeeId ? <EmployeeLink employeeId={employeeId} name={name} /> : name;
}

/** "Mona Ibrahim changed …" in English; "منى إبراهيم · تعديل …" in Arabic (verbal nouns) and on History. */
function EntryLine({ entry, joined, linkRecord }: { entry: AuditEntry; joined: boolean; linkRecord: boolean }) {
  if (isFailedSignIn(entry)) {
    return (
      <p className="text-sm leading-relaxed text-warning-ink">
        <Sentence entry={entry} />
      </p>
    );
  }
  return (
    <p className="text-sm leading-relaxed">
      <ActorName entry={entry} />
      {joined ? ' ' : <span className="text-muted-foreground"> · </span>}
      <Sentence entry={entry} lowerFirst={joined} linkRecord={linkRecord} />
    </p>
  );
}

function Arrow() {
  const { t, locale } = useTranslation();
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        {locale === 'ar' ? '←' : '→'}
      </span>
      <span className="sr-only">{t('audit.timeline.to')}</span>
    </>
  );
}

function Value({ row, side, entry }: { row: ChangeRow; side: 'before' | 'after'; entry: AuditEntry }) {
  const { t, has, locale } = useTranslation();
  const value = row[side];
  if (isMoneyField(row.field) && typeof value === 'number') return <Money value={value} />;
  return <bdi>{formatAuditValue(row.field, value, t, has, locale, entry.entityType)}</bdi>;
}

/**
 * The changed fields: the first few inline, the rest behind "+ n more". Labels sit in a column as
 * wide as the longest one (up to 11rem, then they wrap); the arrow stays with the new value.
 */
function Changes({ entry, inline }: { entry: AuditEntry; inline: number }) {
  const { t, has, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rows = changeRows(entry.changes, t, has, locale, entry.entityType);
  if (rows.length === 0) return null;
  const shown = open ? rows : rows.slice(0, inline);
  const hidden = rows.length - inline;
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted px-3 py-2 text-[0.8125rem]">
      <dl
        id={listId}
        className="grid gap-y-1 @min-[34rem]:grid-cols-[fit-content(11rem)_minmax(0,1fr)] @min-[34rem]:gap-x-3"
      >
        {shown.map((row) => (
          <div key={row.key} className="grid gap-y-0.5 @min-[34rem]:contents">
            <dt className="font-semibold leading-snug text-muted-foreground break-words">{row.label}</dt>
            <dd className="min-w-0 leading-snug break-words [overflow-wrap:anywhere]">
              {row.hidden ? (
                // R7: the viewer may not see salaries — the field changed, its values stay out.
                <span className="text-muted-foreground italic">{t('audit.timeline.valueHidden')}</span>
              ) : (
              <>
              {row.created ? null : (
                <>
                  <span className="text-muted-foreground line-through decoration-muted-foreground/60">
                    <Value row={row} side="before" entry={entry} />
                  </span>{' '}
                </>
              )}
              {/* One unit: the arrow never ends a line on its own, away from the value it points at. */}
              <span className="inline">
                {row.created ? null : (
                  <>
                    <Arrow />{' '}
                  </>
                )}
                <span className={cn('font-bold', isMoneyField(row.field) && 'text-info-ink')}>
                  <Value row={row} side="after" entry={entry} />
                </span>
              </span>
              </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="tap-target cursor-pointer self-start rounded-sm py-0.5 text-[0.8125rem] font-bold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
        >
          {open ? t('audit.timeline.less') : t('audit.timeline.more', { count: hidden })}
        </button>
      ) : null}
    </div>
  );
}

function ModuleChip({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation();
  const hr = entry.module === 'hr';
  const Icon = hr ? HrModuleIcon : CoreModuleIcon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
        hr ? 'bg-primary-soft text-primary' : 'bg-secondary text-muted-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {t(`audit.modules.${entry.module}`)}
    </span>
  );
}

function Tag({ tone, icon: Icon, children }: { tone: 'money' | 'failed'; icon: AppIcon; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
        tone === 'money' ? 'bg-info-soft text-info-ink' : 'bg-warning-soft text-warning-ink',
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}

function EntryMeta({ entry }: { entry: AuditEntry }) {
  const { t, locale } = useTranslation();
  const href = recordHref(entry, locale);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <ModuleChip entry={entry} />
      {isMoneyEntry(entry) ? (
        <Tag tone="money" icon={MoneyIcon}>
          {t('audit.timeline.money')}
        </Tag>
      ) : null}
      {isFailedSignIn(entry) ? (
        <Tag tone="failed" icon={FailedSignInIcon}>
          {t('audit.timeline.failed')}
        </Tag>
      ) : null}
      {href ? (
        <Link
          href={href}
          className="tap-target inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.8125rem] font-bold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring/55"
        >
          <OpenRecordIcon className="size-4 shrink-0" />
          {t('audit.timeline.openRecord')}
        </Link>
      ) : null}
    </div>
  );
}

/** The line and the entry's icon, masked by a ring so the line seems to pass behind it. */
function Rail({ entry }: { entry: AuditEntry }) {
  const { icon: Icon, tone } = entryLook(entry);
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex justify-center',
        'before:absolute before:inset-y-0 before:w-0.5 before:bg-border',
        'group-first/item:before:top-3.5 group-last/item:before:bottom-auto group-last/item:before:h-3.5',
      )}
    >
      <span className={cn('relative mt-1 grid size-8 place-items-center rounded-[0.7rem] ring-4 ring-card', TONE_CLASSES[tone])}>
        <Icon className="size-4.5" />
      </span>
    </div>
  );
}

function TimelineItem({
  entry,
  grouping,
  now,
  joined,
}: {
  entry: AuditEntry;
  grouping: TimelineGrouping;
  now: IsoDateTime;
  joined: boolean;
}) {
  const { t, locale } = useTranslation();
  const time = formatSchoolTime(entry.at, locale);
  const exact = formatSchoolDateTime(entry.at, locale);
  const ago = grouping === 'day' ? relativeAgo(entry.at, now, t) : null;
  const day = grouping === 'month' ? formatShortDay(schoolDay(entry.at), locale) : null;
  const sub = day ?? ago;
  return (
    <li
      data-testid="audit-entry"
      className="group/item grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 px-4 @min-[34rem]:grid-cols-[5.25rem_2.25rem_minmax(0,1fr)] @min-[34rem]:px-6"
    >
      <div className="hidden flex-col items-end gap-px pt-2 text-end @min-[34rem]:flex">
        <time dateTime={entry.at} title={exact} className="tabular text-[0.8125rem] font-semibold whitespace-nowrap">
          {day ?? time}
        </time>
        {sub && day ? <span className="tabular text-xs text-muted-foreground">{time}</span> : null}
        {ago ? <span className="text-xs text-muted-foreground">{ago}</span> : null}
      </div>
      <Rail entry={entry} />
      <div className="flex min-w-0 flex-col gap-1.75 pt-1.5 pb-4.5">
        <div>
          {/* Phone: when, above the sentence. */}
          <p className="tabular mb-0.5 text-xs text-muted-foreground @min-[34rem]:hidden">
            <time dateTime={entry.at} title={exact}>
              {sub ? `${sub} · ${time}` : time}
            </time>
          </p>
          <EntryLine entry={entry} joined={joined} linkRecord={grouping === 'day'} />
        </div>
        <Changes entry={entry} inline={INLINE_CHANGES[grouping]} />
        {grouping === 'day' ? <EntryMeta entry={entry} /> : null}
      </div>
    </li>
  );
}

interface Group {
  key: string;
  entries: AuditEntry[];
}

function groupEntries(entries: AuditEntry[], grouping: TimelineGrouping): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const key = grouping === 'day' ? schoolDay(entry.at) : schoolMonth(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  return groups;
}

/** A day's header; `total` is the whole day's count for the filters (not this page's), when known. */
function DayHeading({ day, total, now }: { day: string; total: number | undefined; now: IsoDateTime }) {
  const { t, locale } = useTranslation();
  const today = schoolDay(now);
  const date = formatDayHeading(day, locale);
  const title =
    day === today
      ? t('audit.timeline.today', { date })
      : day === addDays(today, -1)
        ? t('audit.timeline.yesterday', { date })
        : date;
  return (
    <h3 className="flex items-center gap-2.5 px-4 pt-4 pb-2 font-display text-[0.9375rem] font-extrabold @min-[34rem]:px-6">
      <span>{title}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      {total === undefined ? null : (
        <span data-testid="day-total" className="tabular font-sans text-xs font-semibold text-muted-foreground">
          {t('audit.timeline.dayCount', { count: total })}
        </span>
      )}
    </h3>
  );
}

/**
 * Entries newest first, under day (Activity) or month (History) headers. `now` comes from the
 * server render, so "12 min ago" and "Today" read the same on both sides.
 */
export function AuditTimeline({
  entries,
  grouping,
  now,
  label,
  dayTotals,
}: {
  entries: AuditEntry[];
  grouping: TimelineGrouping;
  now: IsoDateTime;
  /** Accessible name of the list. */
  label: string;
  /** Each day's whole count for the current filters (`GET /audit/day-totals`); none → no counts. */
  dayTotals?: Partial<Record<IsoDate, number>>;
}) {
  const { locale } = useTranslation();
  // Activity reads "Mona changed …" in English; Arabic sentences are verbal nouns, joined with "·".
  const joined = grouping === 'day' && locale === 'en';
  return (
    <section aria-label={label} className="flex flex-col pt-1.5">
      {groupEntries(entries, grouping).map((group) => (
        <Fragment key={group.key}>
          {grouping === 'day' ? (
            <DayHeading day={group.key} total={dayTotals?.[group.key as IsoDate]} now={now} />
          ) : (
            <h3 className="px-4 pt-4 pb-1.5 text-[0.8125rem] font-extrabold tracking-wide text-muted-foreground @min-[34rem]:px-6">
              {formatMonthHeading(group.key as `${number}-${number}`, locale)}
            </h3>
          )}
          <ol className="flex flex-col">
            {group.entries.map((entry) => (
              <TimelineItem key={entry.id} entry={entry} grouping={grouping} now={now} joined={joined} />
            ))}
          </ol>
        </Fragment>
      ))}
    </section>
  );
}

/** The timeline's shape while it loads: same headers, rows, line and inline-change blocks. */
export function AuditTimelineSkeleton({ rows = 10, grouping = 'day' }: { rows?: number; grouping?: TimelineGrouping }) {
  const { t } = useTranslation();
  const headerAt = new Set([0, Math.ceil(rows / 2)]);
  return (
    <div aria-busy="true" className="flex flex-col pt-1.5">
      <span role="status" className="sr-only">
        {t('ui.states.loading')}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <Fragment key={i}>
          {headerAt.has(i) ? (
            <div className="flex items-center gap-2.5 px-4 pt-4 pb-2 @min-[34rem]:px-6" aria-hidden="true">
              <SkeletonText className="font-display text-[0.9375rem]" width={grouping === 'day' ? 'w-52' : 'w-28'} />
              <span className="h-px flex-1 bg-border" />
              {grouping === 'day' ? <SkeletonText className="text-xs" width="w-14" /> : null}
            </div>
          ) : null}
          <div
            aria-hidden="true"
            className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 px-4 @min-[34rem]:grid-cols-[5.25rem_2.25rem_minmax(0,1fr)] @min-[34rem]:px-6"
          >
            <div className="hidden flex-col items-end gap-1 pt-2 @min-[34rem]:flex">
              <SkeletonText className="text-[0.8125rem]" width="w-10" />
              <SkeletonText className="text-xs" width="w-14" />
            </div>
            <div className="relative flex justify-center before:absolute before:inset-y-0 before:w-0.5 before:bg-border">
              <Skeleton className="relative mt-1 size-8 rounded-[0.7rem] ring-4 ring-card" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.75 pt-1.5 pb-4.5">
              <SkeletonText className="text-sm leading-relaxed" width={i % 3 === 0 ? 'w-3/4' : 'w-2/3'} />
              {i % 4 === 3 ? null : <Skeleton className="h-12 rounded-xl" />}
              {grouping === 'day' ? <SkeletonText className="text-xs" width="w-36" /> : null}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
