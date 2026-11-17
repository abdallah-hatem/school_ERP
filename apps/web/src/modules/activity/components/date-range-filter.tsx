'use client';

import type { IsoDate } from '@school-erp/shared';
import { useState } from 'react';
import { addDays } from '@/core/audit';
import { RangeCalendar, type DateRange } from '@/shared/components/ui/calendar';
import { CalendarIcon, ChevronDownIcon } from '@/shared/components/ui/icons';
import { controlClasses } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { fromIsoDate, toIsoDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { formatFilterRange } from '@/core/audit/lib/time';

type Preset = 'any' | 'today' | 'last7' | 'last30' | 'thisMonth';

/** A preset's first and last day, counted back from the school's `today`. */
export function presetRange(preset: Preset, today: IsoDate): { from?: IsoDate; to?: IsoDate } {
  switch (preset) {
    case 'any':
      return {};
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisMonth':
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

const PRESETS: readonly Preset[] = ['any', 'today', 'last7', 'last30', 'thisMonth'];

/**
 * The date-range filter: presets beside a range calendar, in a popover from its trigger. Days are
 * the school's calendar days; the range ends inclusive. Future days can't be picked.
 */
export function DateRangeFilter({
  from,
  to,
  today,
  onChange,
  disabled,
}: {
  from?: IsoDate;
  to?: IsoDate;
  /** Today in the school's calendar (from the server render). */
  today: IsoDate;
  onChange: (range: { from?: IsoDate; to?: IsoDate }) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [anchor, setAnchor] = useState<Date | null>(null);
  const set = Boolean(from || to);
  const label = set ? formatFilterRange(from ?? to!, to ?? from!, locale) : t('audit.filters.anyDate');
  const current = PRESETS.find((p) => {
    const r = presetRange(p, today);
    return r.from === from && r.to === to;
  });

  function choose(range: { from?: IsoDate; to?: IsoDate }) {
    setOpen(false);
    onChange(range);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setAnchor(null);
        if (next) setDraft(from && to ? { from: fromIsoDate(from), to: fromIsoDate(to) } : undefined);
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={`${t('audit.filters.dateRange')}: ${label}`}
          className={cn(
            controlClasses,
            // The chosen range wraps onto a second line rather than being cut off (either language).
            'flex min-h-11 w-full cursor-pointer items-center gap-2 py-2 text-start',
            set && 'border-primary bg-primary-soft text-primary',
          )}
        >
          <CalendarIcon className="size-5 shrink-0" />
          <span className="tabular min-w-0 flex-1 leading-snug font-semibold break-words">{label}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      {/* Phone: presets in an even two-column grid above the calendar, centred in the popup. */}
      <PopoverContent className="scrollbar-clean flex w-auto flex-col items-center gap-3 overflow-y-auto p-3 sm:flex-row sm:items-start">
        <ul className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-36 sm:flex-col">
          {PRESETS.map((p) => (
            <li key={p}>
              <button
                type="button"
                aria-pressed={current === p}
                onClick={() => choose(presetRange(p, today))}
                className={cn(
                  'min-h-11 w-full cursor-pointer rounded-lg px-3 text-start text-sm font-semibold transition-colors duration-150 sm:min-h-9',
                  current === p ? 'bg-primary-soft text-primary' : 'hover:bg-muted',
                )}
              >
                {t(`audit.filters.${p === 'any' ? 'anyDate' : p}`)}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-1.5 sm:items-stretch">
          <p className="self-stretch px-1 text-xs text-muted-foreground">{t('audit.filters.pickRange')}</p>
          <RangeCalendar
            locale={locale}
            selected={draft}
            defaultMonth={draft?.from ?? fromIsoDate(today)}
            disabled={{ after: fromIsoDate(today) }}
            previousLabel={t('audit.filters.previousMonth')}
            nextLabel={t('audit.filters.nextMonth')}
            onSelect={(_, day) => {
              // The first tap marks one edge; the second (either side, or the same day) applies.
              if (!anchor) {
                setAnchor(day);
                setDraft({ from: day, to: day });
                return;
              }
              const [first, last] = anchor <= day ? [anchor, day] : [day, anchor];
              setAnchor(null);
              choose({ from: toIsoDate(first), to: toIsoDate(last) });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
