import type { DownloadedFile } from '@/lib/types';

/** Browser only: saves a file fetched through the API layer (`responseType: 'file'`). */
export function saveDownloadedFile(file: DownloadedFile): void {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Let the click start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
