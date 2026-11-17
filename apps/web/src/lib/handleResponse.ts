import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import type { ApiResult } from '@/lib/types';

interface HandleResponseProps<R> {
  response: R;
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
}

function errorMessageOf(response: { message?: unknown; error?: unknown }): string {
  if (typeof response.message === 'string' && response.message) return response.message;
  if (typeof response.error === 'string' && response.error) return response.error;
  return 'An error occurred';
}

/**
 * Toasts + the logout redirect. Runs twice per client call: inside the endpoint on the server
 * (inert — no window) and again in the browser via callApi, where toasts can appear.
 * Components never call toast.* themselves.
 */
export async function handleResponse<R extends ApiResult>({
  response,
  showErrorToast = true,
  showSuccessToast = false,
}: HandleResponseProps<R>): Promise<R> {
  // 401 — apiFetch has already cleared the auth cookies; send the user to sign in.
  if (response.unauthorized) {
    if (typeof window !== 'undefined') {
      const { userStore } = await import('@/store/userStore');
      userStore.getState().clearUser();
      if (showErrorToast) toast.error(errorMessageOf(response));
      window.location.href = response.redirect;
      return response;
    }
    redirect(response.redirect);
  }

  // Toasts are client-only.
  if (typeof window !== 'undefined') {
    if (response.success && showSuccessToast && typeof response.message === 'string') {
      toast.success(response.message);
    }
    if (response.success === false && showErrorToast) {
      toast.error(errorMessageOf(response));
    }
  }

  return response;
}
