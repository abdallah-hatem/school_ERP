import type { DownloadedFile } from '@/lib/types';

/*
 * Browser only. What happens to a printed copy's PDF once the API made it (spec → Printing): on a
 * computer it is printed from a hidden frame (or opened in a new tab when the browser won't print
 * a frame); on a phone it goes to the share sheet — print, save to Files, WhatsApp… — and where the
 * browser can't share a file it opens in the browser's PDF viewer (edge case 18).
 */

export function pdfBlob(file: DownloadedFile): Blob {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Opens the copy's own file in a new tab; false when the browser blocked the window. */
export function openPdf(fileUrl: string): boolean {
  const opened = window.open(fileUrl, '_blank');
  // A blocked popup returns null: the caller then offers a link to tap.
  if (opened) opened.opener = null;
  return opened !== null;
}

/**
 * Prints the PDF from a hidden frame (the browser's print dialog over the PDF). Falls back to
 * opening the file in a new tab. Resolves to how it went.
 */
export function printPdf(blob: Blob, fileUrl: string): Promise<'printed' | 'opened' | 'blocked'> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.className = 'pointer-events-none fixed start-0 top-0 size-px opacity-0';
    let done = false;
    const fallback = () => {
      if (done) return;
      done = true;
      resolve(openPdf(fileUrl) ? 'opened' : 'blocked');
    };
    frame.onload = () => {
      if (done) return;
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error('no frame window');
        win.focus();
        win.print();
        done = true;
        resolve('printed');
      } catch {
        fallback();
      }
    };
    frame.src = url;
    document.body.append(frame);
    // The PDF viewer never loaded (a browser that doesn't show PDFs in frames): open it instead.
    setTimeout(fallback, 8000);
    // Long enough for the print dialog to have read the PDF.
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  });
}

export type ShareOutcome = 'shared' | 'cancelled' | 'opened' | 'needsTap' | 'blocked';

/**
 * A phone's "Print or PDF": the share sheet with the PDF file when the browser can share files,
 * else the file in the browser's viewer. `needsTap`: the browser wants a fresh tap to share (the
 * PDF took a while to make) — the caller shows a "Share or print" button.
 */
export async function sharePdf(blob: Blob, name: string, fileUrl: string): Promise<ShareOutcome> {
  const file = new File([blob], name, { type: 'application/pdf' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (error) {
      const kind = (error as { name?: string } | null)?.name;
      if (kind === 'AbortError') return 'cancelled';
      if (kind === 'NotAllowedError') return 'needsTap';
    }
  }
  return openPdf(fileUrl) ? 'opened' : 'blocked';
}
