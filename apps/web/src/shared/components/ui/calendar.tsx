'use client';

import type { ChangeEvent } from 'react';
import {
  DayPicker,
  type CustomComponents,
  type DateRange,
  type DropdownProps,
  type Matcher,
} from 'react-day-picker';
import { arEG, enGB } from 'react-day-picker/locale';
import { cn } from '@/shared/lib/utils';
import { buttonVariants } from './button';
import { ChevronDownIcon, ChevronEndIcon, ChevronStartIcon } from './icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/**
 * The caption's month / year picker: the kit's Select (never a native `<select>`), reporting back
 * through the change event DayPicker expects.
 */
function CaptionDropdown({ options, value, onChange, disabled, 'aria-label': ariaLabel, className }: DropdownProps) {
  return (
    <Select
      value={value === undefined ? undefined : String(value)}
      disabled={disabled}
      onValueChange={(next) => onChange?.({ target: { value: next } } as ChangeEvent<HTMLSelectElement>)}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn('h-9 gap-1 px-2.5 font-display font-bold', className)}>
        <SelectValue />
      </SelectTrigger>
      {/* Year and month names are short: let the list size to them rather than to the trigger. */}
      <SelectContent className="w-auto">
        {options?.map((option) => (
          <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled} className="min-h-9">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The week starts on Sunday in both languages: the school's working week (Sunday–Thursday), so
 * English and Arabic grids line up the same days in the same columns.
 */
export const WEEK_STARTS_ON = 0;

/**
 * The month grid's look, shared by the single-day and the range calendars. On a phone each day is
 * 44px (a finger's width); from 768px the grid keeps its desktop 40px. The month arrows keep their
 * size and grow their hit area instead (`tap-target`).
 */
const CALENDAR_CLASS_NAMES = {
  months: 'relative flex flex-col gap-4',
  month: 'flex flex-col gap-3',
  // The nav lies over the caption so its buttons flank the month / year pickers; only the
  // buttons take pointer events, or the nav would swallow every click on the pickers.
  nav: 'pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between',
  button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'tap-target pointer-events-auto'),
  button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'tap-target pointer-events-auto'),
  month_caption: 'flex h-9 items-center justify-center px-10 font-display text-sm font-bold',
  dropdowns: 'flex min-w-0 items-center gap-1.5',
  months_dropdown: 'min-w-0 flex-1',
  years_dropdown: 'w-[5.25rem] shrink-0',
  weekdays: 'flex',
  weekday: 'w-11 text-center text-xs font-semibold text-muted-foreground md:w-10',
  week: 'mt-1 flex',
  day: 'size-11 p-0 text-center text-sm md:size-10',
  day_button: cn(
    'size-11 cursor-pointer rounded-lg transition-colors duration-150 hover:bg-primary-soft hover:text-primary md:size-10',
    'focus-visible:outline-3 focus-visible:outline-ring/55',
  ),
  selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover',
  today: '[&>button]:font-extrabold [&>button]:text-primary',
  outside: 'text-muted-foreground/60',
  disabled: 'opacity-40 [&>button]:cursor-not-allowed',
  hidden: 'invisible',
};

function calendarComponents(dir: 'rtl' | 'ltr'): Partial<CustomComponents> {
  return {
    Dropdown: CaptionDropdown,
    Chevron: ({ orientation, className: chevronClass }) => {
      if (orientation === 'down' || orientation === 'up') {
        return <ChevronDownIcon className={cn('size-4', orientation === 'up' && 'rotate-180', chevronClass)} />;
      }
      // DayPicker names the previous button's chevron "left" and the next one's "right" in both
      // directions. Previous sits at the start edge, so its arrow points to that edge: left in
      // English, right in Arabic. The icons are physical (no flip-rtl), so pick them here.
      const pointsLeft = (orientation === 'left') === (dir === 'ltr');
      return pointsLeft ? (
        <ChevronStartIcon data-points="left" className={cn('size-4', chevronClass)} />
      ) : (
        <ChevronEndIcon data-points="right" className={cn('size-4', chevronClass)} />
      );
    },
  };
}

/**
 * Single-day month grid for the date field. Arabic month names, Latin digits, mirrored under RTL.
 * `captionLayout="dropdown"` adds month and year pickers between `startMonth` and `endMonth`, so a
 * date decades back is one choice away.
 */
export function Calendar({
  className,
  locale,
  selected,
  onSelect,
  defaultMonth,
  disabled,
  previousLabel,
  nextLabel,
  captionLayout = 'label',
  startMonth,
  endMonth,
  monthLabel,
  yearLabel,
}: {
  className?: string;
  locale: 'en' | 'ar';
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  defaultMonth?: Date;
  disabled?: Matcher | Matcher[];
  previousLabel: string;
  nextLabel: string;
  captionLayout?: 'label' | 'dropdown';
  /** First and last month the picker can show. */
  startMonth?: Date;
  endMonth?: Date;
  /** Accessible names of the month / year pickers. */
  monthLabel?: string;
  yearLabel?: string;
}) {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onSelect}
      defaultMonth={defaultMonth}
      disabled={disabled}
      captionLayout={captionLayout}
      startMonth={startMonth}
      endMonth={endMonth}
      reverseYears
      labels={{
        labelPrevious: () => previousLabel,
        labelNext: () => nextLabel,
        ...(monthLabel ? { labelMonthDropdown: () => monthLabel } : {}),
        ...(yearLabel ? { labelYearDropdown: () => yearLabel } : {}),
      }}
      locale={locale === 'ar' ? arEG : enGB}
      dir={dir}
      numerals="latn"
      weekStartsOn={WEEK_STARTS_ON}
      showOutsideDays
      className={cn('tabular w-fit', className)}
      classNames={CALENDAR_CLASS_NAMES}
      components={calendarComponents(dir)}
    />
  );
}

/**
 * A first-to-last-day range on one month grid (the activity log's date filter): the first tap
 * starts the range, the second ends it. Same look and direction rules as `Calendar`.
 */
export function RangeCalendar({
  className,
  locale,
  selected,
  onSelect,
  defaultMonth,
  disabled,
  previousLabel,
  nextLabel,
}: {
  className?: string;
  locale: 'en' | 'ar';
  selected: DateRange | undefined;
  /** `day` is the day tapped, for callers that place the range edges themselves. */
  onSelect: (range: DateRange | undefined, day: Date) => void;
  defaultMonth?: Date;
  disabled?: Matcher | Matcher[];
  previousLabel: string;
  nextLabel: string;
}) {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <DayPicker
      mode="range"
      selected={selected}
      onSelect={onSelect}
      defaultMonth={defaultMonth}
      disabled={disabled}
      labels={{ labelPrevious: () => previousLabel, labelNext: () => nextLabel }}
      locale={locale === 'ar' ? arEG : enGB}
      dir={dir}
      numerals="latn"
      weekStartsOn={WEEK_STARTS_ON}
      showOutsideDays
      className={cn('tabular w-fit', className)}
      classNames={{
        ...CALENDAR_CLASS_NAMES,
        // Every day in the range is "selected"; only its two ends are solid teal with white text.
        // The days between sit on the pale band in dark text (white on it was unreadable).
        selected: '',
        range_start: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover',
        range_end: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover',
        range_middle:
          'bg-primary-soft [&>button]:rounded-none [&>button]:bg-transparent [&>button]:font-semibold [&>button]:text-foreground',
      }}
      components={calendarComponents(dir)}
    />
  );
}

export type { DateRange };
