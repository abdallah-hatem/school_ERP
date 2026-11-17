'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent } from './dialog';
import { Label } from './label';
import { Textarea } from './textarea';

const REASON_MAX = 500;

/**
 * "Are you sure?" with an optional required reason (cancel a penalty, deactivate an employee).
 * Confirm stays disabled until the reason has text, shows busy while `onConfirm` runs and can't be
 * pressed twice. The dialog closes only when `onConfirm` resolves without returning `false`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  requireReason = false,
  reasonLabel,
  reasonPlaceholder,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'destructive';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Receives the trimmed reason when `requireReason` is set. Return `false` to keep it open. */
  onConfirm: (reason?: string) => Promise<boolean | void> | boolean | void;
}) {
  const { t } = useTranslation();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const trimmed = reason.trim();
  const blocked = requireReason && trimmed.length === 0;

  function change(next: boolean) {
    if (busy) return;
    if (!next) setReason('');
    onOpenChange(next);
  }

  async function confirm() {
    if (busy || blocked) return;
    setBusy(true);
    try {
      const result = await onConfirm(requireReason ? trimmed : undefined);
      if (result !== false) {
        setReason('');
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        size="sm"
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={busy}>
                {t('ui.dialog.cancel')}
              </Button>
            </DialogClose>
            <Button
              variant={tone === 'destructive' ? 'destructive' : 'primary'}
              disabled={blocked}
              loading={busy}
              onClick={() => void confirm()}
            >
              {confirmLabel ?? t('ui.dialog.confirm')}
            </Button>
          </>
        }
      >
        {requireReason ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>
              {reasonLabel ?? t('ui.dialog.reasonLabel')}
              <span aria-hidden="true" className="ms-0.5 text-destructive">
                *
              </span>
            </Label>
            <Textarea
              id={reasonId}
              required
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              placeholder={reasonPlaceholder ?? t('ui.dialog.reasonPlaceholder')}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>{blocked ? t('ui.dialog.reasonRequired') : null}</span>
              <span dir="ltr" className="tabular">
                {t('ui.form.counter', { count: reason.length, max: REASON_MAX })}
              </span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
