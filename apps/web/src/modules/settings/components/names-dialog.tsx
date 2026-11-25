'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useRef, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { SwitchField, TextField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { NAME_MAX, namesSchema, type NamesFormValues } from '../schemas';

/**
 * Add or rename a named item (stage, department, job title, catalogue group): English and Arabic
 * names, both required. Mount it with a `key` per item so its fields start from that item.
 * `onSubmit` resolves `true` to close. `toggle` adds a switch below the names (job titles'
 * "Manages people", §3) — its value is `managesPeople`.
 */
export function NamesDialog({
  open,
  onOpenChange,
  title,
  max,
  initial,
  placeholders,
  submitLabel,
  toggle,
  extra,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  max: 'list' | 'group';
  initial?: NamesFormValues;
  placeholders: { en: string; ar: string };
  submitLabel: string;
  toggle?: { label: string; hint: string };
  /** Shown under the names, read-only (a penalty action's effect). */
  extra?: ReactNode;
  onSubmit: (values: NamesFormValues) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const busy = useRef(false);
  const form = useForm<NamesFormValues>({
    resolver: zodResolver(namesSchema(max)),
    mode: 'onChange',
    defaultValues: { nameEn: '', nameAr: '', ...(toggle ? { managesPeople: false } : {}), ...initial },
  });
  const { isDirty, isValid, isSubmitting } = form.formState;

  async function submit(values: NamesFormValues) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (await onSubmit(values)) onOpenChange(false);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent
        size="md"
        title={title}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={isSubmitting}>
                {t('common.actions.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" form={formId} variant="primary" disabled={!isDirty || !isValid} loading={isSubmitting}>
              {submitLabel}
            </Button>
          </>
        }
      >
        <Form id={formId} onSubmit={(e) => void form.handleSubmit(submit)(e)}>
          <TextField
            control={form.control}
            name="nameEn"
            label={t('settings.names.nameEn')}
            placeholder={placeholders.en}
            maxLength={NAME_MAX[max]}
            dir="ltr"
            required
          />
          <TextField
            control={form.control}
            name="nameAr"
            label={t('settings.names.nameAr')}
            placeholder={placeholders.ar}
            maxLength={NAME_MAX[max]}
            dir="rtl"
            required
          />
          {toggle ? <SwitchField control={form.control} name="managesPeople" label={toggle.label} hint={toggle.hint} /> : null}
          {extra}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
