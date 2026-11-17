'use client';

import { LOGO_UPLOAD } from '@school-erp/shared';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useSchoolBranding } from '@/core/settings';
import { callApi } from '@/lib/callApi';
import { Button } from '@/shared/components/ui/button';
import { FileButton } from '@/shared/components/ui/file-button';
import { SchoolIcon, UploadIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { UPLOAD_SCHOOL_LOGO } from '../apis';
import { useReportDirty } from '../hooks/unsaved-changes';
import { SectionPanel } from './section-panel';

/** Why a picked file can't be the logo (§7: PNG, JPG or SVG, at most 2 MB), or null. */
export function logoFileProblem(file: Pick<File, 'type' | 'size'>): 'type' | 'size' | null {
  if (!(LOGO_UPLOAD.mimeTypes as readonly string[]).includes(file.type)) return 'type';
  if (file.size > LOGO_UPLOAD.maxBytes) return 'size';
  return null;
}

const MAX_MB = LOGO_UPLOAD.maxBytes / (1024 * 1024);

/**
 * The school logo: the current one, pick a file (checked here before it is sent), a preview, then
 * upload. A successful upload updates the shell's logo at once.
 */
export function LogoCard({ logoUrl, onUploaded }: { logoUrl: string | null; onUploaded: (logoUrl: string) => void }) {
  const { t } = useTranslation();
  const { branding, setBranding } = useSchoolBranding();
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [problem, setProblem] = useState<'type' | 'size' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const busy = useRef(false);
  useReportDirty('logo', pending !== null);

  // Free the preview's object URL when it is replaced or the card goes away.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.preview);
  }, [pending]);

  function pick(file: File) {
    setUploaded(false);
    const why = logoFileProblem(file);
    setProblem(why);
    setPending(why ? null : { file, preview: URL.createObjectURL(file) });
  }

  async function upload() {
    if (!pending || busy.current) return;
    busy.current = true;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', pending.file);
      const res = await callApi(UPLOAD_SCHOOL_LOGO(form));
      if (res.success && res.data) {
        setBranding({ ...branding, logoUrl: res.data.logoUrl });
        onUploaded(res.data.logoUrl);
        setPending(null);
        setUploaded(true);
      }
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }

  const shown = pending?.preview ?? logoUrl;
  return (
    <SectionPanel title={t('settings.logo.title')} description={t('settings.logo.description', { max: MAX_MB })}>
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-muted">
          {shown ? (
            <Image
              src={shown}
              alt={pending ? t('settings.logo.previewAlt') : t('settings.logo.currentAlt')}
              width={96}
              height={96}
              unoptimized
              className="size-full object-contain p-2"
            />
          ) : (
            <SchoolIcon className="size-10 text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {pending ? t('settings.logo.ready', { name: pending.file.name }) : shown ? t('settings.logo.current') : t('settings.logo.none')}
          </p>
          <div className="flex flex-wrap gap-2">
            <FileButton
              accept={LOGO_UPLOAD.mimeTypes.join(',')}
              inputLabel={t('settings.logo.choose')}
              onFile={pick}
              disabled={uploading}
            >
              {t('settings.logo.choose')}
            </FileButton>
            {pending ? (
              <>
                <Button variant="primary" loading={uploading} onClick={() => void upload()}>
                  {uploading ? null : <UploadIcon />}
                  {t('settings.logo.upload')}
                </Button>
                <Button variant="ghost" disabled={uploading} onClick={() => setPending(null)}>
                  {t('common.actions.cancel')}
                </Button>
              </>
            ) : null}
          </div>
          {problem ? (
            <p role="alert" className="text-sm font-semibold text-destructive-ink">
              {t(`settings.logo.problems.${problem}`, { max: MAX_MB })}
            </p>
          ) : null}
          {uploaded ? (
            <p role="status" className="text-sm text-success-ink">
              {t('settings.logo.uploaded')}
            </p>
          ) : null}
        </div>
      </div>
    </SectionPanel>
  );
}
