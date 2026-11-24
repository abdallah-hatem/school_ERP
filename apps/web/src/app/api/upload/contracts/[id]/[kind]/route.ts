import { CONTRACT_DOCUMENT_UPLOAD, CONTRACT_SIGNED_COPY_UPLOAD, ErrorCode } from '@school-erp/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { proxyUpload } from '@/lib/upload-proxy';
import { CONTRACTS_TAG } from '@/modules/hr/contracts/lib/cache-tags';

/**
 * `POST /api/upload/contracts/:id/signed-copy` (a page of the signed copy, ≤ 10 MB) and
 * `POST /api/upload/contracts/:id/files` (a decision's letter, ≤ 5 MB): streamed to the API's
 * route of the same name (`proxyUpload`). Anything else here is not found.
 */
const KINDS: Record<string, number> = {
  'signed-copy': CONTRACT_SIGNED_COPY_UPLOAD.maxBytes,
  files: CONTRACT_DOCUMENT_UPLOAD.maxBytes,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const maxBytes = Object.hasOwn(KINDS, kind) ? KINDS[kind] : undefined;
  if (!maxBytes || !UUID.test(id)) {
    return NextResponse.json({ success: false, error: ErrorCode.NOT_FOUND }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return proxyUpload(req, { apiPath: `/hr/contracts/${id}/${kind}`, maxBytes, tags: [CONTRACTS_TAG] });
}
