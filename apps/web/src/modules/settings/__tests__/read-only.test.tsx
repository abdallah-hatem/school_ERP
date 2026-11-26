// @vitest-environment jsdom
import '@/test/dom-polyfills';
import type { ListItem, PenaltyGroup, SessionUser } from '@school-erp/shared';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  GET_SCHOOL_SETTINGS_FOR_EDIT: vi.fn(),
  UPDATE_SCHOOL_SETTINGS: vi.fn(),
  UPLOAD_SCHOOL_LOGO: vi.fn(),
  GET_HR_SETTINGS: vi.fn(),
  UPDATE_HR_SETTINGS: vi.fn(),
  GET_SCHOOL_CALENDAR: vi.fn(),
  PUT_SCHOOL_CALENDAR: vi.fn(),
  GET_LIST_ITEMS: vi.fn(),
  CREATE_LIST_ITEM: vi.fn(),
  UPDATE_LIST_ITEM: vi.fn(),
  GET_PENALTY_GROUPS: vi.fn(),
  GET_PENALTY_ACTIONS: vi.fn(),
  GET_PENALTY_ACTION_CHOICES: vi.fn(),
  CREATE_PENALTY_ACTION: vi.fn(),
  UPDATE_PENALTY_ACTION: vi.fn(),
  CREATE_PENALTY_GROUP: vi.fn(),
  UPDATE_PENALTY_GROUP: vi.fn(),
  CREATE_VIOLATION: vi.fn(),
  UPDATE_VIOLATION: vi.fn(),
}));
vi.mock('../apis', () => api);
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/settings',
  useSearchParams: () => new URLSearchParams(),
}));

import { sessionWith, sessionWithout, STAGE_HEAD_KEYS, TEST_SESSION } from '@/test/render';
import { CatalogueSection } from '../components/catalogue-section';
import { HrRulesSection } from '../components/hr-rules-section';
import { ListManager } from '../components/list-manager';
import { SchoolSection } from '../components/school-section';
import { hrSettings, ok, renderSettings, school } from './helpers';
import { lvl, SEEDED_ITEMS } from '@/test/penalty-actions';

/*
 * A view-only user (they hold a section's view key, not its edit key) sees the section read-only:
 * fields disabled, no add / remove / row menus, no Save bar. The API refuses the writes anyway;
 * this is the screen. Settings → Accounting has its own case in accounting-rules.test.tsx.
 */

/** The loaded section (its skeleton shows the same cards under a busy mask). */
async function loaded(title: string) {
  await screen.findByText(title);
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}

const textbox = (name: RegExp) => screen.getByRole('textbox', { name }) as HTMLInputElement;

const stages: ListItem[] = [{ id: 's1', nameEn: 'Primary', nameAr: 'الابتدائية', sortOrder: 1, isActive: true }];

const catalogue: PenaltyGroup[] = [
  {
    id: 'g1',
    nameEn: 'General table A',
    nameAr: 'الجدول العام أ',
    sortOrder: 1,
    isActive: true,
    violations: [
      {
        id: 'v1',
        nameEn: 'Late arrival',
        nameAr: 'التأخر',
        note: null,
        isActive: true,
        oncePerDay: false,
        levels: [lvl(1, 'WARNING', null)],
      },
    ],
  },
];

beforeEach(() => {
  api.GET_SCHOOL_SETTINGS_FOR_EDIT.mockImplementation(() => ok(school));
  api.GET_HR_SETTINGS.mockImplementation(() => ok(hrSettings));
  api.GET_SCHOOL_CALENDAR.mockImplementation((year: number) => ok({ year, calendar: null }));
  api.GET_LIST_ITEMS.mockImplementation(() => ok(stages));
  api.GET_PENALTY_GROUPS.mockImplementation(() => ok(catalogue));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});


// The Penalty actions card and the level editor's picker (spec 2026-11-25): the seeded ten.
beforeEach(() => {
  api.GET_PENALTY_ACTIONS.mockImplementation(() => ok(SEEDED_ITEMS, { total: SEEDED_ITEMS.length, page: 1, limit: 20 }));
  api.GET_PENALTY_ACTION_CHOICES.mockImplementation(() => ok(SEEDED_ITEMS));
});

describe('Settings → School, view only vs edit', () => {
  it('without core.settings.edit: every field disabled, no logo upload, no Save bar', async () => {
    renderSettings(<SchoolSection />, 'en', sessionWithout('core.settings.edit'));
    await loaded('School');
    expect(textbox(/School name in English/)).toHaveProperty('disabled', true);
    expect(textbox(/School name in Arabic/)).toHaveProperty('disabled', true);
    expect(textbox(/School name in English/).value).toBe(school.nameEn);
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByText('Choose a file')).toBeNull();
  });

  it('with core.settings.edit: the fields are editable and the Save bar is there', async () => {
    renderSettings(<SchoolSection />, 'en', TEST_SESSION);
    await loaded('School');
    expect(textbox(/School name in English/)).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});

describe('Settings → HR rules, view only vs edit', () => {
  it('without hr.settings.edit: fields disabled, no adding or removing hour steps, no Save bar', async () => {
    renderSettings(<HrRulesSection />, 'en', sessionWithout('hr.settings.edit'));
    await loaded('Lateness rule');
    for (const name of [/Grace minutes/, /Day value divisor/, /Hour 1/, /Default probation length/]) {
      expect(textbox(name)).toHaveProperty('disabled', true);
    }
    expect(screen.queryByRole('button', { name: 'Add an hour step' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove hour/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    // The School calendar is read-only too.
    expect(screen.getByRole('button', { name: /First day of term 1/ })).toHaveProperty('disabled', true);
    // The example is a calculator, not a setting: it still shows.
    expect(screen.getByTestId('lateness-example').textContent).not.toBe('');
  });

  it('with hr.settings.edit: editable, steps can be added, Save bar present', async () => {
    const user = userEvent.setup();
    renderSettings(<HrRulesSection />, 'en', TEST_SESSION);
    await loaded('Lateness rule');
    expect(textbox(/Grace minutes/)).toHaveProperty('disabled', false);
    await user.click(screen.getByRole('button', { name: 'Add an hour step' }));
    expect(screen.getAllByRole('button', { name: /Remove hour/ }).length).toBeGreaterThan(1);
    // The rules' Save bar, and the School calendar's in its own words.
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save calendar' })).toBeTruthy();
  });
});

describe('Settings → Structure and lists, view only vs edit', () => {
  it('a Stage head (core.stages.view only): the stages are listed with no Add and no row menu', async () => {
    renderSettings(<ListManager kind="stages" />, 'en', sessionWith(...STAGE_HEAD_KEYS));
    expect((await screen.findAllByText('Primary'))[0]).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add stage' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('with core.stages.manage: Add and the row menu are there', async () => {
    renderSettings(<ListManager kind="stages" />, 'en', TEST_SESSION);
    expect((await screen.findAllByText('Primary'))[0]).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add stage' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Actions for Primary/ }).length).toBeGreaterThan(0);
  });

  it('a Principal (hr.lists.view, no manage): departments read-only', async () => {
    renderSettings(<ListManager kind="departments" />, 'en', sessionWithout('hr.lists.manage'));
    expect((await screen.findAllByText('Primary'))[0]).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add department' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });
});

describe('Settings → Penalty catalogue, view only vs edit', () => {
  async function openGroup(session: SessionUser) {
    const user = userEvent.setup();
    renderSettings(<CatalogueSection />, 'en', session);
    await user.click(await screen.findByRole('button', { name: /^General table A/, expanded: false }));
    await screen.findByText('Late arrival');
  }

  it('a Stage head (view only): groups and violations listed, no Add group / Add violation, no menus', async () => {
    await openGroup(sessionWith(...STAGE_HEAD_KEYS));
    expect(screen.queryByRole('button', { name: 'Add group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add violation' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });

  it('with hr.penalty_catalogue.manage: Add group, Add violation and the menus are there', async () => {
    await openGroup(TEST_SESSION);
    expect(screen.getByRole('button', { name: 'Add group' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add violation' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Actions for/ }).length).toBeGreaterThan(0);
  });
});
