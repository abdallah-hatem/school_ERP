import { CONTRACT_SIGNED_COPY_UPLOAD, signedCopyFileProblem, type ContractSignedCopy } from '@school-erp/shared';
import { callApi } from '@/lib/callApi';
import { handleResponse } from '@/lib/handleResponse';
import type { ApiResult } from '@/lib/types';
import type { Translate } from '@/shared/lib/i18n';
import { ADD_SIGNED_COPY_PAGE } from '../apis';

/*
 * A contract's signed copy (owner, 2026-11-24): pages uploaded one request each, in the order
 * picked, so they keep that order; the API checks each again (type by its bytes, 10 MB).
 */

/** The size limit in MB, for the hints. */
export const SIGNED_COPY_MAX_MB = CONTRACT_SIGNED_COPY_UPLOAD.maxBytes / (1024 * 1024);

/** Why a picked file can't be a page (translated under `prefix`: `.type` / `.size`), or null. */
export function signedCopyProblemText(file: Pick<File, 'type' | 'size' | 'name'>, t: Translate, prefix: string): string | null {
  const why = signedCopyFileProblem(file);
  if (why === 'type') return t(`${prefix}.type`);
  if (why === 'size') return t(`${prefix}.size`, { name: file.name, max: SIGNED_COPY_MAX_MB });
  return null;
}

export interface UploadPagesResult {
  added: number;
  failed: number;
  /** The pages after the last page that went up (or null when none did). */
  copy: ContractSignedCopy | null;
  unauthorized: boolean;
  /** The last answers of each kind, for the toasts (`announcePages`). */
  lastAdded: ApiResult | null;
  lastFailed: ApiResult | null;
}

/**
 * Uploads `files` as pages of the contract's signed copy, one after the other (their order is the
 * pages' order). `onProgress(done, total)` before each. A refused page doesn't stop the others.
 */
export async function uploadSignedPages(
  contractId: string,
  files: readonly File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadPagesResult> {
  const result: UploadPagesResult = { added: 0, failed: 0, copy: null, unauthorized: false, lastAdded: null, lastFailed: null };
  for (const [i, file] of files.entries()) {
    onProgress?.(i + 1, files.length);
    const form = new FormData();
    form.append('file', file);
    const res = await callApi(ADD_SIGNED_COPY_PAGE(contractId, form), { showErrorToast: false });
    if (res.unauthorized) return { ...result, unauthorized: true };
    if (res.success && res.data) {
      result.added += 1;
      result.copy = res.data;
      result.lastAdded = res;
    } else {
      result.failed += 1;
      result.lastFailed = res;
    }
  }
  return result;
}

/** One toast per outcome, in the screen's language: "2 pages added." / "1 page couldn't be uploaded…". */
export async function announcePages(result: UploadPagesResult, t: Translate): Promise<void> {
  if (result.lastAdded) {
    await handleResponse({
      response: result.lastAdded,
      showSuccessToast: true,
      successMessage: t('contracts.signedCopy.added', { count: result.added }),
    });
  }
  if (result.lastFailed && result.lastFailed.success === false) {
    await handleResponse({
      response: { ...result.lastFailed, message: t('contracts.signedCopy.failed', { count: result.failed }) },
      showErrorToast: true,
    });
  }
}
