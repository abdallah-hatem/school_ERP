import type { ContractFileUpload, ContractSignedCopy, Uuid } from '@school-erp/shared';
import { uploadFile } from '@/lib/upload';

/*
 * The contracts' uploads, through this app's upload Route Handler
 * (`app/api/upload/contracts/[id]/[kind]/route.ts`), not a Server Action: a signed copy's page is
 * up to 10 MB, a letter up to 5 MB, and Server Actions keep a small body limit (docs/ARCHITECTURE.md
 * → Security → Uploads).
 */

const path = (id: Uuid, kind: 'signed-copy' | 'files') => `/api/upload/contracts/${encodeURIComponent(id)}/${kind}`;

/** `POST /hr/contracts/:id/signed-copy` — one page (PDF / PNG / JPG / WebP, ≤ 10 MB), added at the end. */
export function uploadSignedCopyPage(id: Uuid, file: File) {
  return uploadFile<ContractSignedCopy>(path(id, 'signed-copy'), file);
}

/** `POST /hr/contracts/:id/files` — a decision's letter or attachment (≤ 5 MB); answers where it is stored. */
export function uploadContractFile(id: Uuid, file: File) {
  return uploadFile<ContractFileUpload>(path(id, 'files'), file);
}
