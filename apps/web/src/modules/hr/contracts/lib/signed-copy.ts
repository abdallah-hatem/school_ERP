import { CONTRACT_SIGNED_COPY_UPLOAD, ErrorCode, signedCopyFileProblem, type ContractSignedCopy } from '@school-erp/shared';
import { callApi } from '@/lib/callApi';
import { handleResponse } from '@/lib/handleResponse';
import type { ApiResult } from '@/lib/types';
import type { Translate } from '@/shared/lib/i18n';
import { uploadSignedCopyPage } from './uploads';

/*
 * A contract's signed copy (owner, 2026-11-24): pages uploaded one request each, in the order
 * picked, so they keep that order; the API checks each again (type by its bytes, 10 MB, 30 pages).
 */

/** The size limit in MB, for the hints. */
export const SIGNED_COPY_MAX_MB = CONTRACT_SIGNED_COPY_UPLOAD.maxBytes / (1024 * 1024);
export const SIGNED_COPY_MAX_PAGES = CONTRACT_SIGNED_COPY_UPLOAD.maxPages;

/** Why a picked file can't be a page (translated under `prefix`: `.type` / `.size`), or null. */
export function signedCopyProblemText(file: Pick<File, 'type' | 'size' | 'name'>, t: Translate, prefix: string): string | null {
  const why = signedCopyFileProblem(file);
  if (why === 'type') return t(`${prefix}.type`);
  if (why === 'size') return t(`${prefix}.size`, { name: file.name, max: SIGNED_COPY_MAX_MB });
  return null;
}

/** How long to wait before a page refused for "too many requests" is sent again: at most this often. */
const RETRIES_ON_429 = 3;
const MAX_WAIT_SECONDS = 65;

export interface UploadPagesResult {
  added: number;
  /** The pages that didn't go up, by name, in order (the screen lists them). */
  failedNames: string[];
  /** The pages after the last page that went up (or null when none did). */
  copy: ContractSignedCopy | null;
  unauthorized: boolean;
  /** The last answers of each kind, for the toasts (`announcePages`). */
  lastAdded: ApiResult | null;
  lastFailed: ApiResult | null;
}

export type UploadProgress = { done: number; total: number; waitSeconds?: number };

const wait = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** The seconds a 429 asks to wait (`params.count`), within reason. */
function retryAfter(res: ApiResult): number {
  const count = (res as { params?: { count?: unknown } }).params?.count;
  return typeof count === 'number' && count > 0 ? Math.min(count, MAX_WAIT_SECONDS) : 10;
}

/**
 * Uploads `files` as pages of the contract's signed copy, one after the other (their order is the
 * pages' order). A page refused for "too many requests" (the uploads limit, shared with other
 * uploads) waits as long as the API says and is sent again, a few times; a page refused for good
 * doesn't stop the others and is named in `failedNames`. `onProgress` before each page and while
 * waiting.
 */
export async function uploadSignedPages(
  contractId: string,
  files: readonly File[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadPagesResult> {
  const result: UploadPagesResult = { added: 0, failedNames: [], copy: null, unauthorized: false, lastAdded: null, lastFailed: null };
  for (const [i, file] of files.entries()) {
    onProgress?.({ done: i + 1, total: files.length });
    let res = await callApi(uploadSignedCopyPage(contractId, file), { showErrorToast: false });
    for (let attempt = 0; attempt < RETRIES_ON_429 && !res.unauthorized && res.success === false && res.error === ErrorCode.TOO_MANY_REQUESTS; attempt++) {
      const seconds = retryAfter(res);
      onProgress?.({ done: i + 1, total: files.length, waitSeconds: seconds });
      await wait(seconds);
      onProgress?.({ done: i + 1, total: files.length });
      res = await callApi(uploadSignedCopyPage(contractId, file), { showErrorToast: false });
    }
    if (res.unauthorized) return { ...result, unauthorized: true };
    if (res.success && res.data) {
      result.added += 1;
      result.copy = res.data;
      result.lastAdded = res;
    } else {
      result.failedNames.push(file.name);
      result.lastFailed = res;
    }
  }
  return result;
}

/** "Not uploaded: a.jpg, b.jpg" — the pages that didn't go up, or null. */
export function failedPagesText(result: UploadPagesResult, t: Translate): string | null {
  if (result.failedNames.length === 0) return null;
  return `${t('contracts.signedCopy.failed', { count: result.failedNames.length })} ${t('contracts.signedCopy.failedNames', {
    names: result.failedNames.join(t('contracts.signedCopy.listSeparator')),
  })}`;
}

/** One toast per outcome, in the screen's language: "2 pages added." / "1 page couldn't be uploaded… Not uploaded: x.jpg". */
export async function announcePages(result: UploadPagesResult, t: Translate): Promise<void> {
  if (result.lastAdded) {
    await handleResponse({
      response: result.lastAdded,
      showSuccessToast: true,
      successMessage: t('contracts.signedCopy.added', { count: result.added }),
    });
  }
  const failed = failedPagesText(result, t);
  if (failed && result.lastFailed && result.lastFailed.success === false) {
    await handleResponse({ response: { ...result.lastFailed, message: failed }, showErrorToast: true });
  }
}
