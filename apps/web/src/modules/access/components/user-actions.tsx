'use client';

import type { UserAccount } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { callApi } from '@/lib/callApi';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { DEACTIVATE_USER, REACTIVATE_USER, SET_TEMPORARY_PASSWORD } from '../apis';
import { generateTemporaryPassword } from '../lib/temp-password';
import { TempPasswordBox } from './temp-password';

type Target = Pick<UserAccount, 'id' | 'name'>;
type Open = { kind: 'deactivate' | 'reactivate' | 'password'; user: Target } | null;

/**
 * The three account actions the Users list's ⋯ and a user's page share: deactivate, reactivate
 * (each behind a confirmation) and set a temporary password (a dialog showing the password to give
 * them). `dialogs` must be rendered once; each action refreshes the page's data when it lands.
 */
export function useUserActions(): {
  dialogs: ReactNode;
  deactivate: (user: Target) => void;
  reactivate: (user: Target) => void;
  setPassword: (user: Target) => void;
} {
  const [open, setOpen] = useState<Open>(null);
  const deactivate = useCallback((user: Target) => setOpen({ kind: 'deactivate', user }), []);
  const reactivate = useCallback((user: Target) => setOpen({ kind: 'reactivate', user }), []);
  const setPassword = useCallback((user: Target) => setOpen({ kind: 'password', user }), []);
  return {
    dialogs: <UserActionDialogs open={open} onClose={() => setOpen(null)} />,
    deactivate,
    reactivate,
    setPassword,
  };
}

function UserActionDialogs({ open, onClose }: { open: Open; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const user = open?.user;
  const name = user?.name ?? '';

  async function changeStatus(kind: 'deactivate' | 'reactivate') {
    if (!user) return false;
    const res = await callApi(kind === 'deactivate' ? DEACTIVATE_USER(user.id) : REACTIVATE_USER(user.id), {
      showSuccessToast: true,
      successMessage: t(`access.users.${kind}.done`, { name }),
    });
    if (!res.success) return false;
    router.refresh();
    return true;
  }

  return (
    <>
      <ConfirmDialog
        open={open?.kind === 'deactivate'}
        onOpenChange={(o) => (o ? null : onClose())}
        tone="destructive"
        title={t('access.users.deactivate.title', { name })}
        description={t('access.users.deactivate.body')}
        confirmLabel={t('access.users.deactivate.confirm')}
        onConfirm={() => changeStatus('deactivate')}
      />
      <ConfirmDialog
        open={open?.kind === 'reactivate'}
        onOpenChange={(o) => (o ? null : onClose())}
        title={t('access.users.reactivate.title', { name })}
        description={t('access.users.reactivate.body')}
        confirmLabel={t('access.users.reactivate.confirm')}
        onConfirm={() => changeStatus('reactivate')}
      />
      {open?.kind === 'password' && user ? <TempPasswordDialog user={user} onClose={onClose} /> : null}
    </>
  );
}

/** Set a temporary password: shows a fresh one to give the person, then sets it. */
function TempPasswordDialog({ user, onClose }: { user: Target; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await callApi(SET_TEMPORARY_PASSWORD(user.id, password), {
        showSuccessToast: true,
        successMessage: `${t('access.tempPassword.done')} — ${t('access.tempPassword.doneBody', { name: user.name })}`,
      });
      if (!res.success) return;
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o || busy ? null : onClose())}>
      <DialogContent
        size="sm"
        title={t('access.tempPassword.dialogTitle', { name: user.name })}
        description={t('access.tempPassword.dialogBody')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={busy}>
                {t('ui.dialog.cancel')}
              </Button>
            </DialogClose>
            <Button variant="primary" loading={busy} onClick={() => void confirm()}>
              {t('access.tempPassword.confirm')}
            </Button>
          </>
        }
      >
        <TempPasswordBox
          password={password}
          name={user.name}
          disabled={busy}
          onRegenerate={() => setPassword(generateTemporaryPassword())}
        />
      </DialogContent>
    </Dialog>
  );
}
