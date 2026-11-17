'use client';

import type { ComponentProps } from 'react';
import { SearchIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { cn } from '@/shared/lib/utils';

/*
 * The controls in a list's toolbar: a search box and "All …" filter selects. Lists keep their
 * state in the URL; these only report what the person chose.
 */

/** Radix Select items can't be empty; this one means "no filter". */
const ALL = '__all__';

export interface FilterOption {
  value: string;
  label: string;
}

/** A filter with an "All …" first option; `undefined` means no filter. */
export function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  /** Accessible name, e.g. "Department". */
  label: string;
  /** The no-filter option, e.g. "All departments". */
  allLabel: string;
  value: string | undefined;
  options: FilterOption[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  className?: string;
}) {
  // The trigger names the choice itself: Radix only learns an item's text once the list has
  // mounted, so without children the closed trigger (and the server render) shows nothing.
  const selected = value === undefined ? allLabel : (options.find((o) => o.value === value)?.label ?? allLabel);
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        // A filter in use is tinted, so a narrowed list is visible at a glance.
        className={cn('w-full sm:w-48', value !== undefined && 'border-primary bg-primary-soft text-primary', className)}
      >
        <SelectValue placeholder={allLabel}>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Search box with the leading magnifier. Pass `aria-label` and a translated `placeholder`. */
export function SearchInput({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<typeof Input> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative min-w-0 flex-1 basis-64', wrapperClassName)}>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5" />
      <Input type="search" {...props} className={cn('ps-11', className)} />
    </div>
  );
}
