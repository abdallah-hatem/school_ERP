'use client';

import type { IsoDate, Piastres } from '@school-erp/shared';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Calendar } from '@/shared/components/ui/calendar';
import { CalendarIcon } from '@/shared/components/ui/icons';
import { Input, controlClasses } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { formatDate, formatMoney, fromIsoDate, parseMoney, toIsoDate } from '@/shared/lib/format';
import { normalizeEgyptianMobile } from '@/shared/lib/phone';
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
}: BaseFieldProps<T> & {
  placeholder: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'password';
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  autoComplete?: string;
  /** Shows a live counter. */
  maxLength?: number;
  /** Force a direction for codes and emails inside Arabic forms. */
  dir?: 'ltr' | 'rtl';
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
        />
      )}
    </FieldShell>
  );
}

// ── Phone ────────────────────────────────────────────────────────────────────

/**
 * Egyptian mobile number. The form holds local digits (`01012345678`); a pasted `+20` number is
 * normalised, and a 12th digit, a letter or an impossible prefix is rejected, never trimmed.
 * No `maxLength` — it would clip a pasted `+20…` before it could be normalised.
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
          autoComplete="tel-national"
          dir="ltr"
          className="tabular text-start rtl:text-end"
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const next = normalizeEgyptianMobile(e.target.value);
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
 * Shared engine for number-like fields: raw while focused, formatted on blur (so the caret never
 * jumps), and keystrokes that could never become valid are rejected rather than trimmed.
 */
function FormattedNumberInput({
  value,
  onChange,
  onBlur,
  format,
  parse,
  partial,
  inputMode,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur' | 'type'> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  format: (value: number) => string;
  parse: (text: string) => number | null;
  partial: RegExp;
  inputMode: 'numeric' | 'decimal';
}) {
  // While focused the person edits a raw draft; otherwise the field shows the formatted value,
  // derived from the form so a reset or new default shows up without syncing state.
  const [draft, setDraft] = useState<string | null>(null);
  const display = value == null || Number.isNaN(value) ? '' : format(value);

  return (
    <Input
      {...props}
      type="text"
      inputMode={inputMode}
      dir="ltr"
      className={cn('tabular text-start rtl:text-end', props.className)}
      value={draft ?? display}
      onFocus={() => setDraft(display.replace(/,/g, ''))}
      onChange={(e) => {
        const next = e.target.value.replace(/,/g, '');
        if (!partial.test(next)) return;
        setDraft(next);
        onChange(next === '' ? null : parse(next));
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
  const sign = allowNegative ? '-?' : '';
  const partial = new RegExp(decimals > 0 ? `^${sign}\\d*(\\.\\d{0,${decimals}})?$` : `^${sign}\\d*$`);
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
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            partial={partial}
            parse={(text) => (text === '-' || text === '.' ? null : Number(text))}
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
  const { t } = useTranslation();
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  const partial = allowNegative ? /^-?\d*(\.\d{0,2})?$/ : /^\d*(\.\d{0,2})?$/;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) => (
        // Currency left of the figure in both languages, like <Money>.
        <div className="relative" dir="ltr">
          <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-sm font-semibold text-muted-foreground">
            {t('ui.units.currency')}
          </span>
          <FormattedNumberInput
            {...a11y}
            ref={field.ref}
            name={field.name}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            inputMode="decimal"
            partial={partial}
            parse={(text) => parseMoney(text)}
            format={(v: Piastres) => formatMoney(v)}
            value={field.value as Piastres | null | undefined}
            onChange={field.onChange}
            onBlur={field.onBlur}
            className="ps-14"
          />
        </div>
      )}
    </FieldShell>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
  options,
  emptyText,
}: BaseFieldProps<T> & {
  options: SelectOption[];
  /** Trigger text with nothing chosen, e.g. "Choose a department". */
  placeholder?: string;
  /** What to show when there are no options (and where the first one is made). */
  emptyText?: string;
}) {
  const { t } = useTranslation();
  const id = useFieldId(name);
  const { field, fieldState } = useController({ control, name });
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={fieldState.error?.message} className={className}>
      {(a11y) => (
        <Select
          name={field.name}
          value={(field.value as string | null | undefined) ?? ''}
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
          </SelectContent>
        </Select>
      )}
    </FieldShell>
  );
}

// ── Date ─────────────────────────────────────────────────────────────────────

/** Calendar date picker. The form holds `YYYY-MM-DD`. */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  disabled,
  className,
  placeholder,
}: BaseFieldProps<T> & { placeholder?: string }) {
  const { t, locale } = useTranslation();
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
              selected={value ? fromIsoDate(value) : undefined}
              defaultMonth={value ? fromIsoDate(value) : undefined}
              onSelect={(date) => {
                field.onChange(date ? toIsoDate(date) : null);
                setOpen(false);
              }}
              previousLabel={t('ui.form.previousMonth')}
              nextLabel={t('ui.form.nextMonth')}
            />
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
