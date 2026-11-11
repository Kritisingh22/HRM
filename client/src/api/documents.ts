/* ============================================================
   Official documents — real-backend file access.

   The register list rides the apiBridge (`GET /api/documents`); this
   module owns the authenticated blob operations for stored files:
   viewing inline and downloading as an attachment. Bytes stream through
   the HR server — the browser never sees storage keys, Drive ids or
   provider links, and authorisation is re-checked server-side on every
   request.
   ============================================================ */
import { ApiError } from '@/api/mockServer';
import { apiRequest } from '@/api/client';

export interface DocumentBlob {
  blob: Blob;
  /** server-suggested filename (Content-Disposition), safe to show/save */
  filename: string;
  mimeType: string;
}

/** Read the server's filename suggestion, if any (RFC 5987 aware). */
function filenameFromHeader(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

/** Fetch one stored document (inline for viewing, attachment for saving). */
export async function fetchDocumentBlob(
  id: string,
  opts: { download?: boolean; fallbackName?: string } = {},
): Promise<DocumentBlob> {
  const qs = opts.download ? '?download=1' : '';
  const res = await apiRequest(`/api/documents/${encodeURIComponent(id)}/download${qs}`);
  const blob = await res.blob();
  return {
    blob,
    filename:
      filenameFromHeader(res.headers.get('Content-Disposition')) ?? opts.fallbackName ?? `document-${id}`,
    mimeType: res.headers.get('Content-Type') ?? blob.type ?? 'application/octet-stream',
  };
}

/** Fetch one stored document by its public reference (DOC-YYYY-NNNNNN). */
export async function fetchDocumentByReference(
  referenceId: string,
  opts: { download?: boolean; fallbackName?: string } = {},
): Promise<DocumentBlob> {
  const qs = opts.download ? '?download=1' : '';
  const res = await apiRequest(`/api/documents/reference/${encodeURIComponent(referenceId)}/download${qs}`);
  const blob = await res.blob();
  return {
    blob,
    filename:
      filenameFromHeader(res.headers.get('Content-Disposition')) ?? opts.fallbackName ?? `document-${referenceId}`,
    mimeType: res.headers.get('Content-Type') ?? blob.type ?? 'application/octet-stream',
  };
}

/** Open a stored document inline in a new tab (blob URL — never a Drive link). */
export async function openDocument(id: string, fallbackName?: string): Promise<void> {
  const { blob } = await fetchDocumentBlob(id, { fallbackName });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // give the new tab a moment to load before releasing the object URL
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Human error text for the document actions. */
export function documentErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired — sign in again to open documents.';
    if (err.status === 403) return 'You do not have access to this document.';
    if (err.status === 404) return 'The file is no longer available on the server.';
    if (err.status === 413) return 'This file is larger than the server upload limit.';
    return err.message;
  }
  return 'The document could not be prepared — please try again.';
}
