'use client';

import { CONTRACT_DOCUMENT_UPLOAD } from '@school-erp/shared';
import { useId, useRef, useState } from 'react';
import { callApi } from '@/lib/callApi';
import { Button } from '@/shared/components/ui/button';
import { FileButton } from '@/shared/components/ui/file-button';
import { RemoveIcon, UploadIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { uploadContractFile } from '../lib/uploads';

const MAX_MB = CONTRACT_DOCUMENT_UPLOAD.maxBytes / (1024 * 1024);

/** Why a picked file can't be a contract document (PDF, PNG, JPG or WebP, at most 5 MB), or null. */
export function contractFileProblem(file: Pick<File, 'type' | 'size'>): 'type' | 'size' | null {
  if (!(CONTRACT_DOCUMENT_UPLOAD.mimeTypes as readonly string[]).includes(file.type)) return 'type';
  if (file.size > CONTRACT_DOCUMENT_UPLOAD.maxBytes) return 'size';
  return null;
}

export interface UploadedFile {
  name: string;
  fileUrl: string;
}

/**
 * A scanned letter or an attachment for a contract decision: choose a file (checked here first),
 * it uploads at once (`POST /hr/contracts/:id/files`) and the decision then carries its `fileUrl`.
 * `onBusyChange` keeps the dialog's Save waiting while it uploads.
 */
export function ContractFileField({
  contractId,
  label,
  value,
  onChange,
  onBusyChange,
  disabled = false,
  attachment = false,
}: {
  contractId: string;
  label: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /** "Upload an attachment" instead of "Upload the letter". */
  attachment?: boolean;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const [uploading, setUploading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef(0);

  async function pick(file: File) {
    const why = contractFileProblem(file);
    if (why) {
      setProblem(why === 'type' ? t('contracts.file.type') : t('contracts.file.size', { max: MAX_MB }));
      return;
    }
    setProblem(null);
    const mine = ++seq.current;
    setUploading(file.name);
    onBusyChange?.(true);
    try {
      const res = await callApi(uploadContractFile(contractId, file), { showErrorToast: false });
      if (mine !== seq.current || res.unauthorized) return;
      if (res.success && res.data?.fileUrl) onChange({ name: file.name, fileUrl: res.data.fileUrl });
      else setProblem(t('contracts.file.failed'));
    } finally {
      if (mine === seq.current) {
        setUploading(null);
        onBusyChange?.(false);
      }
    }
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-semibold">
        {label}
      </span>
      {value ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2">
          <span data-testid="contract-file" className="min-w-0 flex-1 truncate text-sm font-semibold">
            {t('contracts.file.attached', { name: value.name })}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer"
            aria-label={t('contracts.file.remove')}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <RemoveIcon />
          </Button>
        </div>
      ) : (
        <FileButton
          accept={CONTRACT_DOCUMENT_UPLOAD.mimeTypes.join(',')}
          inputLabel={label}
          onFile={(file) => void pick(file)}
          disabled={disabled || uploading !== null}
          loading={uploading !== null}
          variant="secondary"
          className={cn('cursor-pointer justify-start border-dashed')}
        >
          {uploading ? null : <UploadIcon />}
          {uploading
            ? t('contracts.file.uploading', { name: uploading })
            : attachment
              ? t('contracts.file.uploadAttachment')
              : t('contracts.file.upload')}
        </FileButton>
      )}
      {problem ? (
        <p role="alert" className="text-xs font-semibold text-destructive-ink">
          {problem}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('contracts.file.hint', { max: MAX_MB })}</p>
      )}
    </div>
  );
}
