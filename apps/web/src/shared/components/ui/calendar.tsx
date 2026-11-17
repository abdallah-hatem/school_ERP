'use client';

import { DayPicker, type Matcher } from 'react-day-picker';
import { arEG, enGB } from 'react-day-picker/locale';
import { cn } from '@/shared/lib/utils';
import { buttonVariants } from './button';
import { ChevronEndIcon, ChevronStartIcon } from './icons';

/** Single-day month grid for the date field. Arabic month names, Latin digits, mirrored under RTL. */
export function Calendar({
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
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  defaultMonth?: Date;
  disabled?: Matcher | Matcher[];
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onSelect}
      defaultMonth={defaultMonth}
      disabled={disabled}
      labels={{ labelPrevious: () => previousLabel, labelNext: () => nextLabel }}
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
        month_caption: 'flex h-9 items-center justify-center font-display text-sm font-bold',
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
