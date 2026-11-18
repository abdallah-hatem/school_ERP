// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/render';
import { Toaster, TOASTER_DESKTOP } from './toaster';

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
  cleanup();
});

function toastNamed(title: string) {
  return screen.getByText(title).closest<HTMLElement>('[data-sonner-toast]')!;
}

describe('Toaster', () => {
  it.each([
    ['success', 'bg-success-soft'],
    ['error', 'bg-destructive-soft'],
    ['warning', 'bg-warning-soft'],
    ['info', 'bg-primary-soft'],
  ] as const)('gives a %s toast its tone icon in a soft badge, and a close button', async (type, tone) => {
    renderWithI18n(<Toaster />);
    act(() => {
      toast[type](`A ${type} toast`, { description: 'More detail' });
    });
    const el = await waitFor(() => toastNamed(`A ${type} toast`));
    expect(el.dataset.type).toBe(type);
    expect(el.dataset.styled).toBe('false'); // none of sonner's own colours
    const badge = el.querySelector<HTMLElement>('[data-icon]')!;
    expect(badge.querySelector('svg')).toBeTruthy();
    expect(badge.className).toContain(`group-data-[type=${type}]:${tone}`);
    expect(within(el).getByText('More detail')).toBeTruthy();
    expect(within(el).getByRole('button', { name: 'Dismiss notification' })).toBeTruthy();
  });

  it('runs an action button and dismisses with the close button', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithI18n(<Toaster />);
    act(() => {
      toast.success('Saved', { action: { label: 'Undo', onClick } });
    });
    const el = await waitFor(() => toastNamed('Saved'));
    await user.click(within(el).getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => {
      toast.error('Failed');
    });
    const failed = await waitFor(() => toastNamed('Failed'));
    await user.click(within(failed).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByText('Failed')).toBeNull(), { timeout: 2000 });
  });

  it('shows a spinner in the badge while loading', async () => {
    renderWithI18n(<Toaster />);
    act(() => {
      toast.loading('Working');
    });
    const el = await waitFor(() => toastNamed('Working'));
    expect(el.dataset.type).toBe('loading');
    expect(el.querySelector('[data-icon] svg.animate-spin')).toBeTruthy();
  });

  it('on a phone (no wide match) sits under the top bar: top-left in Arabic, labelled in Arabic', async () => {
    renderWithI18n(<Toaster />, { locale: 'ar' });
    act(() => {
      toast.success('تم الحفظ');
    });
    const el = await waitFor(() => toastNamed('تم الحفظ'));
    expect(el.dataset.xPosition).toBe('left');
    expect(el.dataset.yPosition).toBe('top');
    expect(within(el).getByRole('button', { name: 'إغلاق الإشعار' })).toBeTruthy();
    expect(screen.getByRole('region', { name: /الإشعارات/ })).toBeTruthy();
  });

  describe('from 600px wide', () => {
    beforeEach(() => {
      // Off the page header's actions (owner 2026-11-18): the bottom inline-end corner.
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === TOASTER_DESKTOP,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sits bottom-right in English', async () => {
      renderWithI18n(<Toaster />);
      act(() => {
        toast.info('Heads up');
      });
      const el = await waitFor(() => toastNamed('Heads up'));
      expect(el.dataset.xPosition).toBe('right');
      expect(el.dataset.yPosition).toBe('bottom');
    });

    it('sits bottom-left in Arabic', async () => {
      renderWithI18n(<Toaster />, { locale: 'ar' });
      act(() => {
        toast.info('تنبيه');
      });
      const el = await waitFor(() => toastNamed('تنبيه'));
      expect(el.dataset.xPosition).toBe('left');
      expect(el.dataset.yPosition).toBe('bottom');
    });
  });
});
