'use client';

import { CONTRACT_SIGNED_COPY_ACCEPT, CONTRACT_SIGNED_COPY_UPLOAD, signedCopyFileProblem } from '@school-erp/shared';
import { callApi } from '@/lib/callApi';
import { PendingFilesField } from '@/shared/components/form/pending-files-field';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_FIRST_CONTRACT_ID, UPLOAD_SIGNED_CONTRACT_PAGE } from '../apis';

const MAX_MB = CONTRACT_SIGNED_COPY_UPLOAD.maxBytes / (1024 * 1024);

/**
 * "Add employee" → the optional signed contract (owner, 2026-11-24): a photo of each page or the
 * PDF, picked now and attached to the employee's first contract right after they are saved — like
 * the photo field. Only for whoever may manage contracts (the form hides it otherwise).
 */
export function EmployeeSignedContractField({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <PendingFilesField
      label={t('employees.signedContract.label')}
      hint={t('employees.signedContract.hint', { max: MAX_MB })}
      chooseLabel={t('employees.signedContract.choose')}
      removeLabel={(name) => t('employees.signedContract.removeFile', { name })}
      accept={CONTRACT_SIGNED_COPY_ACCEPT}
      files={files}
      onChange={onChange}
      check={(file) => {
        const why = signedCopyFileProblem(file);
        if (why === 'type') return t('employees.signedContract.type');
        if (why === 'size') return t('employees.signedContract.size', { name: file.name, max: MAX_MB });
        return null;
      }}
      disabled={disabled}
    />
  );
}

/**
 * Attaches `files` (in order, one page each) to the new employee's first contract. True when every
 * page went up; the employee is saved either way, and the form says so when one didn't.
 */
export async function uploadSignedContract(employeeId: string, files: readonly File[]): Promise<boolean> {
  if (files.length === 0) return true;
  const first = await callApi(GET_FIRST_CONTRACT_ID(employeeId), { showErrorToast: false });
  const contractId = first.success ? first.data?.[0]?.id : undefined;
  if (!contractId) return false;
  let ok = true;
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    const res = await callApi(UPLOAD_SIGNED_CONTRACT_PAGE(contractId, form), { showErrorToast: false });
    if (res.unauthorized) return false;
    if (!res.success) ok = false;
  }
  return ok;
}
