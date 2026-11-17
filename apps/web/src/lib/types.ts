import type { Meta } from '@school-erp/shared';

/**
 * What `apiFetch` returns. It never throws for API failures — check `success` (after
 * `unauthorized`) before touching `data`. Only `redirect()` / `notFound()` propagate.
 */
export type ApiResult<T = unknown> =
  | {
      success: true;
      status: number;
      message?: string;
      data?: T;
      meta?: Meta;
      unauthorized?: undefined;
      [key: string]: unknown;
    }
  | {
      success: false;
      status: number;
      message: string;
      error?: string;
      errors?: unknown;
      data?: unknown;
      networkError?: boolean;
      unauthorized?: undefined;
      [key: string]: unknown;
    }
  | {
      unauthorized: true;
      redirect: string;
      message: string;
      success?: undefined;
    };

/** A file download fetched with `apiFetch(…, { responseType: 'file' })` (base64 crosses the action boundary). */
export interface DownloadedFile {
  fileName: string;
  contentType: string;
  base64: string;
}
