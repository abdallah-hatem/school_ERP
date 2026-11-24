// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; prefetch?: boolean }) => {
    const anchor = { ...props };
    delete anchor.prefetch;
    return <a {...anchor} />;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({
  GET_CONTRACT_TEMPLATES: vi.fn(),
  GET_CONTRACT_TEMPLATE: vi.fn(),
  UPDATE_CONTRACT_TEMPLATE: vi.fn(),
  HIDE_CONTRACT_TEMPLATE: vi.fn(),
  SHOW_CONTRACT_TEMPLATE: vi.fn(),
}));
vi.mock('../apis', () => api);

import { openRowActions } from '@/test/row-actions';
import { ok, renderTemplates, summary } from '../test/fixtures';
import { ContractTemplatesList } from './templates-list';

const fullTime = summary();
const annex = summary({ id: 't-2', nameEn: 'Renewal annex', nameAr: 'ملحق تجديد', hasEnglish: true, defaultForWorkSystem: null, version: 1 });

describe('Settings → Contract templates — the list', () => {
  beforeEach(() => {
    nav.search = 'section=contractTemplates';
    window.history.replaceState(null, '', '/en/settings?section=contractTemplates');
    api.GET_CONTRACT_TEMPLATES.mockImplementation(() => ok([fullTime, annex], { total: 12, page: 1, limit: 25 }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('shows the page the API answered, in its order, with its total (no client paging)', async () => {
    renderTemplates(<ContractTemplatesList editorHref="/en/settings/contract-templates" />);
    const table = await screen.findByRole('table', { name: 'Contract templates' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual([
      'Full-time contractعقد عمل بدوام كامل',
      'Renewal annexملحق تجديد',
    ]);
    expect(within(rows[0]!).getByText('Default for Full-time')).toBeTruthy();
    expect(within(rows[0]!).getByText('Arabic')).toBeTruthy();
    expect(within(rows[1]!).getByText('Arabic + English')).toBeTruthy();
    expect(within(rows[0]!).getByText('v3')).toBeTruthy();
    // 12 templates in all, so a second page exists even though only two rows came.
    expect(screen.getAllByText(/12/).length).toBeGreaterThan(0);
    expect(api.GET_CONTRACT_TEMPLATES).toHaveBeenCalledWith({ search: undefined, hidden: false, page: 1, limit: 25 });
  });

  it('searches through the API after a pause — the browser never filters the rows on screen', async () => {
    const user = userEvent.setup();
    renderTemplates(<ContractTemplatesList editorHref="/en/settings/contract-templates" />);
    const table = await screen.findByRole('table', { name: 'Contract templates' });
    await user.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'zzz');
    // The address carries the search (beside the Settings section) for the API to answer.
    await waitFor(() => expect(window.location.search).toContain('q=zzz'));
    expect(window.location.search).toContain('section=contractTemplates');
    // Nothing matches "zzz", yet both rows stay until the API answers: no client-side search.
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('"Show hidden" goes in the address as hidden=1', async () => {
    const user = userEvent.setup();
    renderTemplates(<ContractTemplatesList editorHref="/en/settings/contract-templates" />);
    await screen.findByRole('table', { name: 'Contract templates' });
    await user.click(screen.getByRole('switch', { name: 'Show hidden' }));
    expect(window.location.search).toContain('hidden=1');
  });

  it('edge case 10: a hidden template has no "Make default for…", only Show', async () => {
    api.GET_CONTRACT_TEMPLATES.mockImplementation(() => ok([summary({ hidden: true, defaultForWorkSystem: null })], { total: 1, page: 1, limit: 25 }));
    const user = userEvent.setup();
    renderTemplates(<ContractTemplatesList editorHref="/en/settings/contract-templates" />);
    await screen.findAllByText('Hidden');
    const menu = await openRowActions(user, 'Full-time contract');
    const items = within(menu).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Edit', 'Show']);
  });
});
