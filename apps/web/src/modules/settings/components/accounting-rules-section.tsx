'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_TAX_RULE,
  payrollTax,
  TAX_BRACKETS_MAX,
  taxRuleIssues,
  type AccountingSettings,
  type TaxRule,
  type UpdateAccountingSettingsRequest,
} from '@school-erp/shared';
import { useId, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { Can, useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { MoneyField, NumberField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { ErrorState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, RemoveIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SkeletonMask } from '@/shared/components/ui/skeleton';
import { formatMoney, parseMoney } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_ACCOUNTING_SETTINGS, UPDATE_ACCOUNTING_SETTINGS } from '../apis';
import { useReportDirty } from '../hooks/unsaved-changes';
import { useResource } from '../hooks/use-resource';
import { accountingRulesSchema, type AccountingRulesFormValues } from '../schemas';
import { SaveBar, SectionPanel } from './section-panel';

/** The §10 defaults, as the form's skeleton while the settings load. */
const PLACEHOLDER: AccountingSettings = { payroll: DEFAULT_TAX_RULE };

function toForm(s: AccountingSettings): AccountingRulesFormValues {
  return {
    payroll: {
      brackets: s.payroll.brackets.map(({ width, percent }) => ({ width, percent })),
      martyrPercent: s.payroll.martyrPercent,
      insurancePercent: s.payroll.insurancePercent,
    },
  };
}

/** Form values → the tax rule the shared maths takes, or null while the rule isn't valid. */
export function taxRuleFromForm(values: {
  brackets: { width: number | null | undefined; percent: number | null | undefined }[] | undefined;
  martyrPercent: number | null | undefined;
  insurancePercent: number | null | undefined;
}): TaxRule | null {
  const { brackets, martyrPercent, insurancePercent } = values;
  if (!brackets?.length || martyrPercent == null || insurancePercent == null) return null;
  if (brackets.some((b) => b.percent == null)) return null;
  const rule: TaxRule = {
    brackets: brackets.map((b, i) => ({
      width: i === brackets.length - 1 ? null : (b.width ?? 0),
      percent: b.percent as number,
    })),
    martyrPercent,
    insurancePercent,
  };
  return taxRuleIssues(rule).length ? null : rule;
}

/**
 * Accounting's rules (§10): the payroll tax rule — monthly income-tax slices, the martyrs' fund
 * and the employee's insurance share. Accounting applies it when HR approves a month.
 */
export function AccountingRulesSection() {
  const { t } = useTranslation();
  const settings = useResource('accounting-settings', () => GET_ACCOUNTING_SETTINGS());

  if (settings.error) {
    return (
      <SectionPanel title={t('settings.sections.accounting.title')}>
        <ErrorState onRetry={settings.retry} retrying={settings.retrying} />
      </SectionPanel>
    );
  }
  if (!settings.data) {
    // The form itself as its skeleton (the §10 defaults as placeholders): every field in place.
    return (
      <SkeletonMask>
        <AccountingRulesForm initial={PLACEHOLDER} onSaved={() => undefined} />
      </SkeletonMask>
    );
  }
  return <AccountingRulesForm initial={settings.data} onSaved={(next) => settings.setData(() => next)} />;
}

function AccountingRulesForm({
  initial,
  onSaved,
}: {
  initial: AccountingSettings;
  onSaved: (next: AccountingSettings) => void;
}) {
  const { t } = useTranslation();
  // Without the edit permission the rule is shown read-only: no typing, no adding or removing slices.
  const canEdit = useCan()('accounting.settings.edit');
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const form = useForm<AccountingRulesFormValues>({
    resolver: zodResolver(accountingRulesSchema),
    mode: 'onChange',
    defaultValues: toForm(initial),
  });
  const { isDirty, isValid, isSubmitting, dirtyFields } = form.formState;
  const brackets = useFieldArray({ control: form.control, name: 'payroll.brackets' });
  useReportDirty('accounting-rules', isDirty);

  async function save(values: AccountingRulesFormValues) {
    if (busy.current) return;
    busy.current = true;
    try {
      // Only the keys that changed: each changed key is one line of the audit entry (§9).
      const payroll: NonNullable<UpdateAccountingSettingsRequest['payroll']> = {};
      // The table is sent whole; the last slice is always "the rest" (no width).
      if (dirtyFields.payroll?.brackets) {
        payroll.brackets = values.payroll.brackets.map((b, i, all) => ({
          width: i === all.length - 1 ? null : b.width,
          percent: b.percent,
        }));
      }
      if (dirtyFields.payroll?.martyrPercent) payroll.martyrPercent = values.payroll.martyrPercent;
      if (dirtyFields.payroll?.insurancePercent) payroll.insurancePercent = values.payroll.insurancePercent;

      const res = await callApi(UPDATE_ACCOUNTING_SETTINGS({ payroll }));
      if (res.success && res.data) {
        form.reset(toForm(res.data));
        setSaved(true);
        onSaved(res.data);
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <Form
      onSubmit={(e) => {
        setSaved(false);
        void form.handleSubmit(save)(e);
      }}
      className="gap-6"
    >
      <SectionPanel title={t('settings.accounting.tax.title')} description={t('settings.accounting.tax.description')}>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{t('settings.accounting.tax.brackets')}</legend>
          <p className="text-xs text-muted-foreground">{t('settings.accounting.tax.bracketsHint')}</p>
          <ol className="flex flex-col gap-3">
            {brackets.fields.map((bracket, i) => {
              const last = i === brackets.fields.length - 1;
              return (
                <li key={bracket.id} className="flex flex-wrap items-start gap-3 rounded-2xl bg-muted p-3">
                  {last ? (
                    <p className="flex min-w-40 flex-1 basis-48 flex-col gap-2 text-sm">
                      <span className="font-semibold">{t('settings.accounting.tax.restLabel')}</span>
                      <span className="text-muted-foreground">{t('settings.accounting.tax.restHint')}</span>
                    </p>
                  ) : (
                    <MoneyField
                      control={form.control}
                      name={`payroll.brackets.${i}.width`}
                      label={t('settings.accounting.tax.widthLabel', { n: i + 1 })}
                      placeholder={t('settings.accounting.tax.widthPlaceholder')}
                      required
                      disabled={!canEdit}
                      className="min-w-40 flex-1 basis-48"
                    />
                  )}
                  <NumberField
                    control={form.control}
                    name={`payroll.brackets.${i}.percent`}
                    label={
                      last
                        ? t('settings.accounting.tax.restRateLabel')
                        : t('settings.accounting.tax.rateLabel', { n: i + 1 })
                    }
                    placeholder={t('settings.accounting.tax.ratePlaceholder')}
                    suffix="%"
                    decimals={2}
                    required
                    disabled={!canEdit}
                    className="w-36"
                  />
                  {/* "The rest" always stays, so it has no remove button. */}
                  {canEdit && !last ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="mt-7"
                      aria-label={t('settings.accounting.tax.removeBracket', { n: i + 1 })}
                      disabled={brackets.fields.length <= 1}
                      onClick={() => brackets.remove(i)}
                    >
                      <RemoveIcon />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {canEdit ? (
            <div>
              <Button
                variant="soft"
                size="sm"
                disabled={brackets.fields.length >= TAX_BRACKETS_MAX}
                onClick={() => {
                  // Inserted before "the rest", at the rate of the slice it follows.
                  const at = brackets.fields.length - 1;
                  const before = form.getValues(`payroll.brackets.${Math.max(at - 1, 0)}.percent`);
                  brackets.insert(at, { width: 100_000, percent: before ?? 0 });
                }}
              >
                <AddIcon />
                {t('settings.accounting.tax.addBracket')}
              </Button>
            </div>
          ) : null}
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          <NumberField
            control={form.control}
            name="payroll.martyrPercent"
            label={t('settings.accounting.tax.martyr')}
            hint={t('settings.accounting.tax.martyrHint')}
            placeholder={t('settings.accounting.tax.martyrPlaceholder')}
            suffix="%"
            decimals={2}
            required
            disabled={!canEdit}
          />
          <NumberField
            control={form.control}
            name="payroll.insurancePercent"
            label={t('settings.accounting.tax.insurance')}
            hint={t('settings.accounting.tax.insuranceHint')}
            placeholder={t('settings.accounting.tax.insurancePlaceholder')}
            suffix="%"
            decimals={2}
            required
            disabled={!canEdit}
          />
        </div>

        <TaxExample control={form.control} />
      </SectionPanel>
      {/* A child of the form, not of the card, so it can stay in view over the whole form. */}
      <Can permission="accounting.settings.edit">
        <SaveBar
          dirty={isDirty}
          valid={isValid}
          saving={isSubmitting}
          saved={saved && !isDirty}
          onDiscard={() => {
            form.reset();
            setSaved(false);
          }}
        />
      </Can>
    </Form>
  );
}

/** 10,000.00 EGP, the example's starting net. */
const TAX_EXAMPLE_NET = 1_000_000;

/**
 * "net 10,000.00 → income tax 1,017.00 · martyrs' fund 5.51 · gross 11,022.51", live as the rule
 * is edited. Uses the shared `payrollTax` — the same gross-up accounting runs (no second copy).
 */
function TaxExample({ control }: { control: Control<AccountingRulesFormValues> }) {
  const { t } = useTranslation();
  const id = useId();
  const [netText, setNetText] = useState(formatMoney(TAX_EXAMPLE_NET));
  const payroll = useWatch({ control, name: 'payroll' });
  const rule = taxRuleFromForm(payroll);
  const net = netText === '' ? null : parseMoney(netText);

  let line: string;
  if (!rule) line = t('settings.accounting.example.invalidRule');
  else if (net === null) line = t('settings.accounting.example.enterNet');
  else {
    const r = payrollTax(net, 0, rule);
    line = t('settings.accounting.example.line', {
      net: formatMoney(net),
      tax: formatMoney(r.incomeTax),
      fund: formatMoney(r.martyrTax),
      gross: formatMoney(r.gross),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary-soft bg-primary-soft/50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor={id}>{t('settings.accounting.example.net')}</Label>
          <Input
            id={id}
            inputMode="decimal"
            dir="ltr"
            className="tabular"
            placeholder={t('settings.accounting.example.netPlaceholder')}
            value={netText}
            onChange={(e) => {
              const next = e.target.value;
              // Digits, thousands commas and up to 2 decimals; anything else is ignored.
              if (!/^[\d,]*(\.\d{0,2})?$/.test(next)) return;
              setNetText(next);
            }}
          />
        </div>
        <p className="min-w-0 flex-1 basis-48 pb-2.5 text-sm font-semibold" aria-live="polite" data-testid="tax-example">
          <span className="text-muted-foreground">{t('settings.accounting.example.label')} </span>
          <bdi>{line}</bdi>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.accounting.example.hint')}</p>
    </div>
  );
}
