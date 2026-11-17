import { handleResponse } from './handleResponse';
import type { ApiResult } from './types';

interface CallApiOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  /** Translated success toast text (the API's envelope message is generic English). */
  successMessage?: string;
}

/**
 * Client components call endpoints through this, never directly: the endpoint's own
 * handleResponse runs on the server where toasts can't render, so this runs it again here.
 */
export async function callApi<R extends ApiResult>(
  request: Promise<R>,
  options: CallApiOptions = {},
): Promise<R> {
  const response = await request;
  await handleResponse({ response, ...options });
  return response;
}
