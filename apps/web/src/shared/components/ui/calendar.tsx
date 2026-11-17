'use client';

import type { ChangeEvent } from 'react';
import { DayPicker, type DropdownProps, type Matcher } from 'react-day-picker';
import { arEG, enGB } from 'react-day-picker/locale';
import { cn } from '@/shared/lib/utils';
import { buttonVariants } from './button';
import { ChevronEndIcon, ChevronStartIcon } from './icons';
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
      <SelectContent>
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
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      numerals="latn"
      showOutsideDays
      className={cn('tabular w-fit', className)}
      classNames={{
        months: 'relative flex flex-col gap-4',
        month: 'flex flex-col gap-3',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        month_caption: 'flex h-9 items-center justify-center px-10 font-display text-sm font-bold',
        dropdowns: 'flex min-w-0 items-center gap-1.5',
        months_dropdown: 'min-w-0 flex-1',
        years_dropdown: 'w-[5.25rem] shrink-0',
        weekdays: 'flex',
        weekday: 'w-10 text-center text-xs font-semibold text-muted-foreground',
        week: 'mt-1 flex',
        day: 'size-10 p-0 text-center text-sm',
        day_button: cn(
          'size-10 cursor-pointer rounded-lg transition-colors duration-150 hover:bg-primary-soft hover:text-primary',
          'focus-visible:outline-3 focus-visible:outline-ring/55',
        ),
        selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover',
        today: '[&>button]:font-extrabold [&>button]:text-primary',
        outside: 'text-muted-foreground/60',
        disabled: 'opacity-40 [&>button]:cursor-not-allowed',
        hidden: 'invisible',
      }}
      components={{
        Dropdown: CaptionDropdown,
        Chevron: ({ orientation, className: chevronClass }) =>
          orientation === 'left' ? (
            <ChevronStartIcon className={cn('size-4', chevronClass)} />
          ) : (
            <ChevronEndIcon className={cn('size-4', chevronClass)} />
          ),
      }}
    />
  );
}
