'use client';

import type { Role } from '@school-erp/shared';
import { formatCount } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';

/**
 * Deleting a role (owner 2026-11-19): any role but the System admin, once nobody holds it. A held
 * role gets the refusal — who still holds it — instead of the confirm; a starting role's confirm
 * adds that future updates give new permissions to starting roles only.
 */
export function RoleDeleteDialog({
  role,
  holderName,
  onOpenChange,
  onConfirm,
}: {
  /** The role being deleted; `null` keeps the dialog closed. */
  role: Role | null;
  /** The only holder's name, when exactly one person holds it and it's known. */
  holderName?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean | void>;
}) {
  const { t, locale } = useTranslation();
  const name = role ? localName(role, locale) : '';

  if (role && role.userCount > 0) {
    const who =
      role.userCount === 1 && holderName
        ? t('access.roles.deleteBlocked', { name: holderName })
        : t('access.roles.deleteBlockedMany', { count: formatCount(role.userCount) });
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          size="sm"
          title={t('access.roles.delete.blockedTitle', { name })}
          description={`${who}. ${t('access.roles.delete.blockedBody')}`}
          footer={
            <DialogClose asChild>
              <Button variant="primary">{t('ui.dialog.close')}</Button>
            </DialogClose>
          }
        />
      </Dialog>
    );
  }

  return (
    <ConfirmDialog
      open={role !== null}
      onOpenChange={onOpenChange}
      tone="destructive"
      title={t('access.roles.delete.title', { name })}
      description={
        <>
          {t('access.roles.delete.body')}
          {role?.builtIn ? (
            <span className="mt-2 block">{t('access.roles.delete.startingRole')}</span>
          ) : null}
        </>
      }
      confirmLabel={t('access.roles.delete.confirm')}
      onConfirm={onConfirm}
    />
  );
}
