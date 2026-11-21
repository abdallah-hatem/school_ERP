'use client';

import type { IsoDate, Piastres } from '@school-erp/shared';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Combobox, needsSearch, type ServerOptions } from '@/shared/components/ui/combobox';
import { CalendarIcon, type AppIcon } from '@/shared/components/ui/icons';
import { GroupedNumberInput } from '@/shared/components/ui/grouped-number-input';
import { Input, controlClasses } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { formatDate, formatMoney, fromIsoDate, parseMoney, toIsoDate } from '@/shared/lib/format';
import { acceptPhoneInput } from '@/shared/lib/phone';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { FieldShell } from './field-shell';

/*
 * Form fields for react-hook-form + zod. Each takes `control` and `name`, owns its label, required
 * asterisk, placeholder, hint and inline error, and keeps the form value typed (number, piastres,
 * `YYYY-MM-DD`) while the input shows text. Labels and placeholders arrive translated.
 */
interface BaseFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

function useFieldId(name: string) {
  return `${useId()}-${name.replace(/\W/g, '-')}`;
}

// ── Text ─────────────────────────────────────────────────────────────────────

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
  dir,
  icon,
}: BaseFieldProps<T> & {
  placeholder: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'password';
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  autoComplete?: string;
  /** Shows a live counter. */
  maxLength?: number;
  /** Force a direction for codes and emails inside Arabic forms. */
  dir?: 'ltr' | 'rtl';
  /** A small icon inside the box at the inline start (the sign-in page's envelope and lock). */
  icon?: AppIcon;
}) {
  const { t } = useTranslation();
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  const value = (field.value as string | null | undefined) ?? '';
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={fieldState.error?.message}
      className={className}
      aside={maxLength ? <span dir="ltr" className="tabular">{t('ui.form.counter', { count: value.length, max: maxLength })}</span> : null}
    >
      {(a11y) => (
        <LeadingIconBox icon={icon}>
          <Input
            {...a11y}
            ref={field.ref}
            name={field.name}
            type={type}
            inputMode={inputMode}
            autoComplete={autoComplete}
            dir={dir}
            required={required}
            disabled={disabled}
            maxLength={maxLength}
            placeholder={placeholder}
            value={value}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            // The icon sits at the page's inline start; a box forced to LTR inside Arabic (an email)
            // keeps its text clear of it on the right.
            className={cn(icon && 'ps-11 text-start', icon && dir === 'ltr' && 'rtl:ps-3.5 rtl:pe-11')}
          />
        </LeadingIconBox>
      )}
    </FieldShell>
  );
}

/** The box around a text input that carries an icon at its inline start; nothing without one. */
function LeadingIconBox({ icon: Icon, children }: { icon?: AppIcon; children: ReactNode }) {
  if (!Icon) return children;
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5 text-muted-foreground" />
      {children}
    </div>
  );
}

// ── Phone ────────────────────────────────────────────────────────────────────

/**
 * Phone number — mobile, landline or international, kept as typed (`+20 2 2345 6789`). A letter or
 * a character past the 20th is rejected rather than trimmed; validate with `isValidPhone`.
 */
export function PhoneField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
}: BaseFieldProps<T> & { placeholder: string }) {
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  const value = (field.value as string | null | undefined) ?? '';
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) => (
        <Input
          {...a11y}
          ref={field.ref}
          name={field.name}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="tabular text-start rtl:text-end"
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const next = acceptPhoneInput(e.target.value);
            if (next !== null) field.onChange(next);
          }}
          onBlur={field.onBlur}
        />
      )}
    </FieldShell>
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────────

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
  rows = 4,
  maxLength,
}: BaseFieldProps<T> & { placeholder: string; rows?: number; maxLength?: number }) {
  const { t } = useTranslation();
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  const value = (field.value as string | null | undefined) ?? '';
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={fieldState.error?.message}
      className={className}
      aside={maxLength ? <span dir="ltr" className="tabular">{t('ui.form.counter', { count: value.length, max: maxLength })}</span> : null}
    >
      {(a11y) => (
        <Textarea
          {...a11y}
          ref={field.ref}
          name={field.name}
          rows={rows}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
        />
      )}
    </FieldShell>
  );
}

// ── Number and money: text inputs that hold a typed value ────────────────────

const groupFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/**
 * Shared engine for number-like fields: grouped live while typing (`30000` → `30,000`, caret kept
 * by digit count, see `GroupedNumberInput`), completed by `format` on blur (`30,000.00` for money).
 * The form always holds the typed value (a number or integer piastres), never the text.
 */
function FormattedNumberInput({
  value,
  onChange,
  onBlur,
  format,
  parse,
  decimals,
  allowNegative,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur' | 'type' | 'inputMode'> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  format: (value: number) => string;
  parse: (text: string) => number | null;
  decimals: number;
  allowNegative: boolean;
}) {
  // While the person edits, the field shows their draft (which may end in "." or "-"); otherwise
  // the formatted value, derived from the form so a reset or new default shows up without syncing.
  const [draft, setDraft] = useState<string | null>(null);
  const display = value == null || Number.isNaN(value) ? '' : format(value);

  return (
    <GroupedNumberInput
      {...props}
      decimals={decimals}
      allowNegative={allowNegative}
      value={draft ?? display}
      onValueChange={(text) => {
        setDraft(text);
        const raw = text.replace(/,/g, '');
        onChange(raw === '' || raw === '-' ? null : parse(raw));
      }}
      onBlur={() => {
        setDraft(null);
        onBlur();
      }}
    />
  );
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
  decimals = 0,
  allowNegative = false,
  suffix,
}: BaseFieldProps<T> & {
  placeholder: string;
  /** Allowed decimal places (`2` for day counts like 1.25). */
  decimals?: number;
  allowNegative?: boolean;
  suffix?: ReactNode;
}) {
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) => (
        <div className="relative">
          <FormattedNumberInput
            {...a11y}
            ref={field.ref}
            name={field.name}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            decimals={decimals}
            allowNegative={allowNegative}
            parse={(text) => Number(text)}
            format={(v) => groupFormatter.format(v)}
            value={field.value as number | null | undefined}
            onChange={field.onChange}
            onBlur={field.onBlur}
            className={suffix ? 'pe-16 rtl:ps-16 rtl:pe-3.5' : undefined}
          />
          {suffix ? (
            <span className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center text-sm text-muted-foreground">
              {suffix}
            </span>
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}

/**
 * Amount in EGP outside a form (a calculator, an example box): the same engine and look as
 * `MoneyField` — `EGP` before the figure, grouped live while typing, `10,000.00` on blur. Holds
 * integer piastres (`null` when empty). Every money input in the app is one of these two.
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  allowNegative = false,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur' | 'type' | 'inputMode'> & {
  value: Piastres | null | undefined;
  onChange: (value: Piastres | null) => void;
  onBlur?: () => void;
  allowNegative?: boolean;
}) {
  const { t } = useTranslation();
  return (
    // Currency left of the figure in both languages, like <Money>.
    <div className={cn('relative', className)} dir="ltr">
      <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-sm font-semibold text-muted-foreground">
        {t('ui.units.currency')}
      </span>
      <FormattedNumberInput
        {...props}
        decimals={2}
        allowNegative={allowNegative}
        parse={(text) => parseMoney(text)}
        format={(v: Piastres) => formatMoney(v)}
        value={value}
        onChange={onChange}
        onBlur={() => onBlur?.()}
        className="ps-14"
      />
    </div>
  );
}

/** Amount in EGP. The form holds integer piastres; the field shows `14,000.00`. */
export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
  allowNegative = false,
}: BaseFieldProps<T> & { placeholder: string; allowNegative?: boolean }) {
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) => (
        <MoneyInput
          {...a11y}
          ref={field.ref}
          name={field.name}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          allowNegative={allowNegative}
          value={field.value as Piastres | null | undefined}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    </FieldShell>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  /** Extra text the searchable version matches but doesn't show (other-language name, a code). */
  keywords?: readonly string[];
  disabled?: boolean;
}

/** A titled section of options (a heading the person can't pick, then its items). */
export interface SelectOptionGroup {
  /** Stable key for the group. */
  key: string;
  label: string;
  options: SelectOption[];
}

/**
 * A select. Over records (employees, departments, violations) pass `server` (`useServerOptions`):
 * the API searches the choices. A short code list (an enum) passes `options`; above
 * `SEARCH_THRESHOLD` options it becomes the searchable `Combobox` by itself (`searchable` forces).
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
  options = [],
  groups,
  emptyText,
  searchable,
  searchPlaceholder,
  noMatchesText,
  server,
}: BaseFieldProps<T> & {
  options?: SelectOption[];
  /** Options under headings, shown after `options` (e.g. violations by catalogue group). */
  groups?: SelectOptionGroup[];
  /** Trigger text with nothing chosen, e.g. "Choose a department". */
  placeholder?: string;
  /** What to show when there are no options (and where the first one is made). */
  emptyText?: string;
  /** Force the search box on (lists of records) or off; by default it shows above 6 options. */
  searchable?: boolean;
  /** The search box's placeholder, e.g. "Type a name or code". */
  searchPlaceholder?: string;
  /** Shown when the search matches nothing. */
  noMatchesText?: string;
  /** Records: the API searches the choices (`options` / `groups` ignored). */
  server?: ServerOptions;
}) {
  const { t } = useTranslation();
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  const count = options.length + (groups ?? []).reduce((n, g) => n + g.options.length, 0);
  const value = (field.value as string | null | undefined) ?? '';
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) =>
        server || needsSearch(count, searchable) ? (
          <Combobox
            server={server}
            {...a11y}
            ref={field.ref}
            name={field.name}
            aria-required={required || undefined}
            disabled={disabled}
            options={options}
            groups={groups}
            value={value}
            onValueChange={field.onChange}
            onClose={field.onBlur}
            placeholder={placeholder ?? t('ui.form.chooseOption')}
            searchPlaceholder={searchPlaceholder ?? t('ui.form.searchOptions')}
            emptyText={emptyText ?? t('ui.form.noOptions')}
            noMatchesText={noMatchesText ?? t('ui.form.noMatches')}
          />
        ) : (
          <Select
            name={field.name}
            value={value}
            onValueChange={field.onChange}
            disabled={disabled}
            required={required}
            onOpenChange={(open) => {
              if (!open) field.onBlur();
            }}
          >
            <SelectTrigger {...a11y} ref={field.ref}>
              <SelectValue placeholder={placeholder ?? t('ui.form.chooseOption')} />
            </SelectTrigger>
            <SelectContent emptyText={emptyText ?? t('ui.form.noOptions')}>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
              {groups?.map((group) => (
                <SelectGroup key={group.key}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map((option) => (
                    <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )
      }
    </FieldShell>
  );
}

// ── Date ─────────────────────────────────────────────────────────────────────

/** Years the month / year pickers offer when no `min` / `max` is given. */
const DATE_FIELD_FIRST_YEAR = 1940;
const DATE_FIELD_YEARS_AHEAD = 2;

/**
 * Calendar date picker with month and year pickers in its caption. The form holds `YYYY-MM-DD`.
 * `min` / `max` (`YYYY-MM-DD`, inclusive) bound the pickers and disable the days outside them —
 * e.g. `max={today}` for a date that can't be in the future.
 */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
  min,
  max,
  clearable,
}: BaseFieldProps<T> & {
  placeholder?: string;
  min?: IsoDate;
  max?: IsoDate;
  /** An optional date that can be emptied again: a "Clear the date" action under the calendar. */
  clearable?: boolean;
}) {
  const { t, locale } = useTranslation();
  const thisYear = new Date().getFullYear();
  const minDate = min ? fromIsoDate(min) : undefined;
  const maxDate = max ? fromIsoDate(max) : undefined;
  const outOfRange = [minDate ? { before: minDate } : null, maxDate ? { after: maxDate } : null].filter(
    (m): m is { before: Date } | { after: Date } => m !== null,
  );
  const id = useFieldId(name);
  const [open, setOpen] = useState(false);
  const { field, fieldState } = useController({ control, name });
  const value = field.value as IsoDate | null | undefined;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) => (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) field.onBlur();
          }}
        >
          <PopoverTrigger asChild disabled={disabled}>
            <button
              {...a11y}
              ref={field.ref}
              type="button"
              className={cn(
                controlClasses,
                'flex h-11 cursor-pointer items-center justify-between gap-2 text-start',
                !value && 'text-muted-foreground/80',
              )}
            >
              <span className="truncate">{value ? formatDate(value, locale) : (placeholder ?? t('ui.form.pickDate'))}</span>
              <CalendarIcon className="size-5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto">
            <Calendar
              locale={locale}
              captionLayout="dropdown"
              startMonth={minDate ?? new Date(DATE_FIELD_FIRST_YEAR, 0)}
              endMonth={maxDate ?? new Date(thisYear + DATE_FIELD_YEARS_AHEAD, 11)}
              disabled={outOfRange.length ? outOfRange : undefined}
              monthLabel={t('ui.form.month')}
              yearLabel={t('ui.form.year')}
              selected={value ? fromIsoDate(value) : undefined}
              defaultMonth={value ? fromIsoDate(value) : maxDate && maxDate < new Date() ? maxDate : undefined}
              onSelect={(date) => {
                field.onChange(date ? toIsoDate(date) : null);
                setOpen(false);
              }}
              previousLabel={t('ui.form.previousMonth')}
              nextLabel={t('ui.form.nextMonth')}
            />
            {clearable && value ? (
              <div className="flex justify-end border-t border-border pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    field.onChange(null);
                    setOpen(false);
                  }}
                >
                  {t('ui.form.clearDate')}
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      )}
    </FieldShell>
  );
}

// ── Switch ───────────────────────────────────────────────────────────────────

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  disabled,
  className,
}: Omit<BaseFieldProps<T>, 'required'>) {
  const id = useFieldId(name);
  const {
    field: { ref, name: fieldName, value, onChange, onBlur },
  } = useController({ control, name });
  return (
    <div className={cn('flex items-start justify-between gap-4 rounded-xl border border-border bg-muted p-4', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        ref={ref}
        name={fieldName}
        checked={Boolean(value)}
        onCheckedChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}

// ── Multi-choice toggles ─────────────────────────────────────────────────────

/**
 * A row of toggle chips for picking several values (working days). The form holds the chosen
 * values in `options` order. Each chip is a button with `aria-pressed`.
 */
export function ToggleGroupField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  options,
}: BaseFieldProps<T> & { options: SelectOption[] }) {
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  const chosen = new Set((field.value as string[] | null | undefined) ?? []);

  function toggle(value: string) {
    const next = new Set(chosen);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    field.onChange(options.map((o) => o.value).filter((v) => next.has(v)));
    field.onBlur();
  }

  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) => (
        <div
          role="group"
          id={a11y.id}
          aria-label={typeof label === 'string' ? label : undefined}
          aria-describedby={a11y['aria-describedby']}
          className="flex flex-wrap gap-2"
        >
          {options.map((option) => {
            const on = chosen.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                disabled={disabled || option.disabled}
                onClick={() => toggle(option.value)}
                className={cn(
                  'h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors duration-150',
                  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
                  'disabled:cursor-not-allowed disabled:opacity-55',
                  on
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </FieldShell>
  );
}
