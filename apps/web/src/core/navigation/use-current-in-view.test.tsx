// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { act, cleanup } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/en';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

import { renderWithI18n } from '@/test/render';
import { NAV_ITEMS } from './nav-items';
import { SidebarNav } from './sidebar-nav';

/*
 * jsdom has no layout, so the menu gets a fake one: a panel 300px tall at the top of the window,
 * every row (link, button, locked row) 40px tall in document order, moved up by the panel's scroll.
 */
const PANEL_HEIGHT = 300;
const ROW = 40;
const scrollTops = new WeakMap<Element, number>();
const panelOf = (el: Element) => el.closest('[data-nav-panel]');
const rows = (panel: Element) => [...panel.querySelectorAll('a, button, [aria-disabled="true"]')];

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) };
}

const pathOf = (key: string) => `/en${NAV_ITEMS.find((i) => i.key === key)!.path}`;
const link = (key: string) => document.querySelector<HTMLElement>(`[data-nav-panel] a[href="${pathOf(key)}"]`)!;
const panel = () => document.querySelector<HTMLElement>('[data-nav-panel]')!;
function inView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= PANEL_HEIGHT;
}

describe('SidebarNav keeps the current page in view', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    pathname = '/en';
    window.localStorage.clear();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollTo.mockClear();
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-nav-panel') ? PANEL_HEIGHT : 0;
    });
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
      return scrollTops.get(this) ?? 0;
    });
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, v: number) {
      scrollTops.set(this, v);
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.hasAttribute('data-nav-panel')) return rect(0, PANEL_HEIGHT);
      const p = panelOf(this);
      if (!p) return rect(0, 0);
      const index = rows(p).indexOf(this);
      return rect(index * ROW - (scrollTops.get(p) ?? 0), ROW);
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(['en', 'ar'] as const)('scrolls the menu, not the window, to a current page low in the list (%s)', (locale) => {
    pathname = pathOf('settings').replace('/en', `/${locale}`);
    renderWithI18n(<SidebarNav variant="full" />, { locale });
    const settings = document.querySelector<HTMLElement>(`[data-nav-panel] [aria-current="page"]`)!;
    expect(settings.getAttribute('href')).toBe(pathname);
    // Settings sits well below the panel's 300px before the scroll.
    expect(rows(panel()).indexOf(settings) * ROW).toBeGreaterThan(PANEL_HEIGHT);
    expect(panel().scrollTop).toBeGreaterThan(0);
    expect(inView(settings)).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
  });

  it('marks the rail tile of the current module, so the rail follows it the same way', () => {
    pathname = pathOf('settings');
    renderWithI18n(<SidebarNav variant="rail" />);
    const current = panel().querySelector('[data-nav-current]');
    expect(current?.getAttribute('aria-label')).toBe('Administration');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves the menu where it is when the current page is already visible', () => {
    pathname = pathOf('dashboard');
    renderWithI18n(<SidebarNav variant="full" />);
    expect(inView(link('dashboard'))).toBe(true);
    expect(panel().scrollTop).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps its scroll position across navigations to a visible page, and follows one off screen', () => {
    pathname = pathOf('settings');
    const view = renderWithI18n(<SidebarNav variant="full" />);
    const scrolled = panel().scrollTop;
    expect(scrolled).toBeGreaterThan(0);

    // Another page on screen (above Settings, now at the bottom edge): nothing moves.
    const visible = [...panel().querySelectorAll<HTMLAnchorElement>('a[href]')].find(
      (a) => inView(a) && a.getAttribute('aria-current') !== 'page',
    )!;
    expect(visible).toBeTruthy();
    pathname = visible.getAttribute('href')!;
    act(() => view.rerender(<SidebarNav variant="full" />));
    expect(visible.getAttribute('aria-current')).toBe('page');
    expect(panel().scrollTop).toBe(scrolled);

    // Dashboard is above the visible part now: the menu comes back up to it.
    pathname = pathOf('dashboard');
    act(() => view.rerender(<SidebarNav variant="full" />));
    expect(inView(link('dashboard'))).toBe(true);
    expect(panel().scrollTop).toBeLessThan(scrolled);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
