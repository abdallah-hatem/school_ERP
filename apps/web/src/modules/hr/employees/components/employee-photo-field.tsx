'use client';

import { EMPLOYEE_PHOTO_UPLOAD, type Employee } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EmployeeAvatar } from '@/core/employees';
import { callApi } from '@/lib/callApi';
import { Button } from '@/shared/components/ui/button';
import { FileButton } from '@/shared/components/ui/file-button';
import { RemoveIcon, UploadIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { REMOVE_EMPLOYEE_PHOTO, UPLOAD_EMPLOYEE_PHOTO } from '../apis';

/** Why a picked file can't be an employee photo (§3: PNG, JPG or WebP, at most 2 MB), or null. */
export function photoFileProblem(file: Pick<File, 'type' | 'size'>): 'type' | 'size' | null {
  if (!(EMPLOYEE_PHOTO_UPLOAD.mimeTypes as readonly string[]).includes(file.type)) return 'type';
  if (file.size > EMPLOYEE_PHOTO_UPLOAD.maxBytes) return 'size';
  return null;
}

const MAX_MB = EMPLOYEE_PHOTO_UPLOAD.maxBytes / (1024 * 1024);

/** Uploads `file` as the employee's photo; the result says whether it worked. */
export async function uploadEmployeePhoto(id: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return callApi(UPLOAD_EMPLOYEE_PHOTO(id, form));
}

/**
 * The employee's photo on the form (§3), like the school logo card: the current photo or the
 * silhouette, choose a file (checked here before it is sent), a preview, then upload — or remove.
 *
 * Editing (`employee` given): Upload and Remove act at once, separately from Save. Adding: the
 * chosen file waits in `onPendingChange` and the form uploads it right after the employee is saved.
 */
export function EmployeePhotoField({
  employee,
  onPendingChange,
}: {
  employee?: Employee;
  onPendingChange?: (file: File | null) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [problem, setProblem] = useState<'type' | 'size' | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [done, setDone] = useState<'uploaded' | 'removed' | null>(null);
  // The photo after this screen's own upload / removal, until the refreshed employee arrives with it.
  const saved = employee?.photoUrl ?? null;
  const [local, setLocal] = useState<{ base: string | null; url: string | null } | null>(null);
  const current = local && local.base === saved ? local.url : saved;
  const inFlight = useRef(false);

  // Free the preview's object URL when it is replaced or the field goes away.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.preview);
  }, [pending]);

  function choose(next: { file: File; preview: string } | null) {
    setPending(next);
    onPendingChange?.(next?.file ?? null);
  }

  function pick(file: File) {
    setDone(null);
    const why = photoFileProblem(file);
    setProblem(why);
    choose(why ? null : { file, preview: URL.createObjectURL(file) });
  }

  async function run(kind: 'upload' | 'remove') {
    if (!employee || inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    try {
      const res =
        kind === 'upload' && pending
          ? await uploadEmployeePhoto(employee.id, pending.file)
          : await callApi(REMOVE_EMPLOYEE_PHOTO(employee.id));
      if (res.success && res.data) {
        setLocal({ base: saved, url: res.data.photoUrl });
        choose(null);
        setDone(kind === 'upload' ? 'uploaded' : 'removed');
        router.refresh();
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const shown = pending?.preview ?? current;
  const status = pending
    ? t(employee ? 'employees.photo.ready' : 'employees.photo.readyOnSave', { name: pending.file.name })
    : current
      ? t('employees.photo.current')
      : t('employees.photo.none');

  return (
    <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
      <EmployeeAvatar photoUrl={shown} size="xl" />
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('employees.photo.description', { max: MAX_MB })}</p>
        <p className="text-sm font-semibold break-words" data-testid="photo-status">
          {status}
        </p>
        <div className="flex flex-wrap gap-2">
          <FileButton
            accept={EMPLOYEE_PHOTO_UPLOAD.mimeTypes.join(',')}
            inputLabel={t('employees.photo.choose')}
            onFile={pick}
            disabled={busy !== null}
            variant="secondary"
          >
            {t('employees.photo.choose')}
          </FileButton>
          {pending ? (
            <>
              {employee ? (
                <Button variant="primary" loading={busy === 'upload'} disabled={busy !== null} onClick={() => void run('upload')}>
                  {busy === 'upload' ? null : <UploadIcon />}
                  {t('employees.photo.upload')}
                </Button>
              ) : null}
              <Button variant="ghost" disabled={busy !== null} onClick={() => choose(null)}>
                {t('common.actions.cancel')}
              </Button>
            </>
          ) : employee && current ? (
            <Button variant="ghost" loading={busy === 'remove'} disabled={busy !== null} onClick={() => void run('remove')}>
              {busy === 'remove' ? null : <RemoveIcon />}
              {t('employees.photo.remove')}
            </Button>
          ) : null}
        </div>
        {problem ? (
          <p role="alert" className="text-sm font-semibold text-destructive-ink">
            {t(`employees.photo.problems.${problem}`, { max: MAX_MB })}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="text-sm text-success-ink">
            {t(`employees.photo.${done}`)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
