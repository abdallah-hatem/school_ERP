// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { BUILT_IN_ROLES, DEFAULT_TAX_RULE, type BuiltInRole, type SessionUser } from '@school-erp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_SCHOOL_SETTINGS_FOR_EDIT: vi.fn(),
  UPDATE_SCHOOL_SETTINGS: vi.fn(),
  UPLOAD_SCHOOL_LOGO: vi.fn(),
  GET_HR_SETTINGS: vi.fn(),
  UPDATE_HR_SETTINGS: vi.fn(),
  GET_LIST_ITEMS: vi.fn(),
  CREATE_LIST_ITEM: vi.fn(),
  UPDATE_LIST_ITEM: vi.fn(),
  GET_ACCOUNTING_SETTINGS: vi.fn(),
  UPDATE_ACCOUNTING_SETTINGS: vi.fn(),
  GET_PENALTY_GROUPS: vi.fn(),
  CREATE_PENALTY_GROUP: vi.fn(),
  UPDATE_PENALTY_GROUP: vi.fn(),
  CREATE_VIOLATION: vi.fn(),
  UPDATE_VIOLATION: vi.fn(),
}));
vi.mock('../apis', () => api);

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/settings',
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

import { sessionWith } from '@/test/render';
import { SettingsScreen } from '../components/settings-screen';
import type { SettingsSectionId } from '../sections';
import { hrSettings, ok, renderSettings, school } from './helpers';

/** A session holding exactly what a built-in role grants. */
function sessionOf(role: BuiltInRole): SessionUser {
  const definition = BUILT_IN_ROLES.find((r) => r.key === role);
  if (!definition) throw new Error(`No built-in role ${role}`);
  return sessionWith(...Object.keys(definition.permissions));
}

function renderScreen(session: SessionUser, initialSection: SettingsSectionId | null) {
  return renderSettings(<SettingsScreen initialSection={initialSection} />, 'en', session);
}

/** The section list's entries, by title. */
function listed(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Settings sections' });
  return within(nav)
    .getAllByRole('button')
    .map((b) => b.querySelector('span > span')?.textContent ?? '');
}

describe('Settings — who sees which section', () => {
  beforeEach(() => {
    api.GET_SCHOOL_SETTINGS_FOR_EDIT.mockImplementation(() => ok(school));
    api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
    api.GET_LIST_ITEMS.mockImplementation(() => ok([]));
    api.GET_PENALTY_GROUPS.mockImplementation(() => ok([]));
    api.GET_ACCOUNTING_SETTINGS.mockImplementation(() => ok({ payroll: DEFAULT_TAX_RULE }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('an Accountant sees only Accounting, and it opens even when the URL names another section', async () => {
    renderScreen(sessionOf('accountant'), 'school');
    expect(listed()).toEqual(['Accounting']);
    expect(await screen.findByText('Tax and insurance')).toBeTruthy();
    expect(api.GET_SCHOOL_SETTINGS_FOR_EDIT).not.toHaveBeenCalled();
    // The built-in Accountant may edit the rule.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Rate for the rest/ })).toHaveProperty('disabled', false),
    );
  });

  it('an Accountant opening Settings with no section lands on Accounting', async () => {
    renderScreen(sessionOf('accountant'), null);
    expect(await screen.findByText('Tax and insurance')).toBeTruthy();
  });

  it('an HR officer asking for Accounting gets their first allowed section, never a load error', async () => {
    renderScreen(sessionOf('hr_officer'), 'accounting');
    expect(listed()).not.toContain('Accounting');
    expect(listed()[0]).toBe('School structure');
    await waitFor(() => expect(api.GET_LIST_ITEMS).toHaveBeenCalledWith('stages', { page: 1, limit: 10 }));
    expect(api.GET_ACCOUNTING_SETTINGS).not.toHaveBeenCalled();
    expect(screen.queryByText("This couldn't load")).toBeNull();
  });

  it('a view-only Accounting user sees the rule read-only', async () => {
    renderScreen(sessionWith('accounting.settings.view'), 'accounting');
    expect(await screen.findByText('Tax and insurance')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(screen.getByRole('textbox', { name: /Rate for the rest/ })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Add a slice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
