import { expect, test } from '@playwright/test';
import {
  BUILT_IN_ROLES,
  SCREEN_IDS,
  SETTINGS_SECTION_ACCESS,
  SIDEBAR_SCREENS,
  canOpenScreen,
  visibleSettingsSections,
} from '@school-erp/shared';
import { sidebarLink } from './support/access';
import { t } from './support/i18n';
import { makeRoleUser, settled, signInAsRoleUser } from './support/role-access';
import { settleStreams } from './support/stream';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/**
 * Runs in the `desktop-en` project (1440×900). Every built-in role, signed in with only that role,
 * opens exactly the screens its permissions allow and gets the not-found screen for the rest; the
 * sidebar shows exactly the allowed pages, and Settings lists only the sections it may view and
 * opens on one of them.
 *
 * Nothing here lists what a role may do: it reads `SCREENS` and `SETTINGS_SECTION_ACCESS` (the
 * lists the page guards and the sidebar use) and `BUILT_IN_ROLES` (what each role is meant to
 * hold). A guard, a sidebar item or a role that drifts from them fails here.
 */

const locale = 'en' as const;

/**
 * TODO(PR #83, accounting settings panel): once it is on dev, `accounting` is a Settings section
 * (`SETTINGS_SECTION_ACCESS.accounting = 'accounting.settings.view'`) and the Accountant holds that
 * key — the review's bug was that the Accountant then still couldn't open Settings → Accounting.
 * The check below runs by itself from then on; until then it is skipped with this note.
 */
const ACCOUNTING_SECTION_LIVE = 'accounting' in SETTINGS_SECTION_ACCESS;

for (const role of BUILT_IN_ROLES) {
  test(`${role.key}: opens exactly the screens its permissions allow`, async ({ browser }) => {
    test.setTimeout(240_000);
    const user = await makeRoleUser(role.key);
    const page = await signInAsRoleUser(browser, user, locale, { width: 1440, height: 900 });
    const main = page.locator('main');
    const notFound = main.getByText(t(locale, 'ui.states.notFoundTitle'));
    // A block that couldn't load, or the whole page's error screen.
    const failed = main.getByText(t(locale, 'ui.states.errorTitle')).or(main.getByText(t(locale, 'ui.errorPages.errorTitle')));
    const allowed: string[] = [];
    const refused: string[] = [];

    for (const id of SCREEN_IDS) {
      const path = user.urls[id];
      if (path === undefined) {
        test.info().annotations.push({ type: 'skipped screen', description: `${id}: no record of it in the database` });
        continue;
      }
      await page.goto(`/${locale}${path}`);
      await settled(page);
      if (canOpenScreen(user.keys, id)) {
        allowed.push(id);
        await expect(main.getByRole('heading', { level: 1 }).first(), `${role.key} should open ${id}`).toBeVisible();
        await expect(notFound, `${role.key} should open ${id}`).toHaveCount(0);
        await expect(failed, `${id} should load for ${role.key}`).toHaveCount(0);
        // The rules a screen shows come with its own data, not from HR settings (which the
        // Principal and the Accountant can't read): no "rules couldn't load" warning for any role.
        await expect(main.getByText(t(locale, 'lateness.settingsError')), `${id}: lateness rule for ${role.key}`).toHaveCount(0);
        await expect(main.getByText(t(locale, 'payroll.rules.error')), `${id}: payroll rules for ${role.key}`).toHaveCount(0);
      } else {
        refused.push(id);
        await expect(notFound, `${role.key} should be refused ${id}`).toBeVisible();
        // The only heading is the not-found screen's own: nothing of the page leaks.
        await expect(main.getByRole('heading', { level: 1 }), `${role.key} should be refused ${id}`).toHaveText([
          t(locale, 'ui.states.notFoundTitle'),
        ]);
      }
    }
    test.info().annotations.push({ type: 'allowed', description: allowed.join(', ') }, { type: 'refused', description: refused.join(', ') });

    // The sidebar: exactly the pages it may open.
    await page.goto(`/${locale}`);
    await settled(page);
    for (const key of SIDEBAR_SCREENS) {
      const link = sidebarLink(page, locale, key);
      if (canOpenScreen(user.keys, key)) await expect(link, `${role.key}: sidebar shows ${key}`).toBeVisible();
      else await expect(link, `${role.key}: sidebar hides ${key}`).toHaveCount(0);
    }

    // Home: the HR dashboard with `hr.dashboard.view`; without it a welcome linking to each screen
    // the role may open (the sidebar's, less Home), then My account — no figures.
    const welcome = main.getByRole('region', { name: t(locale, 'dashboard.welcome.screensTitle') });
    if (user.keys.includes('hr.dashboard.view')) {
      await expect(welcome, `${role.key}: Home is the dashboard`).toHaveCount(0);
    } else {
      const expected = SIDEBAR_SCREENS.filter((key) => key !== 'dashboard' && canOpenScreen(user.keys, key)).map((key) =>
        t(locale, `common.nav.${key}`),
      );
      await expect(welcome.getByRole('link'), `${role.key}: Home links to its screens`).toHaveText([
        ...expected,
        t(locale, 'common.nav.account'),
      ]);
      await expect(main.getByText(t(locale, 'dashboard.headcount.label'))).toHaveCount(0);
    }

    // Settings: only the sections it may view, and it opens on the first of them.
    const sections = visibleSettingsSections(user.keys);
    if (ACCOUNTING_SECTION_LIVE) {
      if (role.key === 'accountant') expect(sections as string[], 'the Accountant sees Settings → Accounting').toContain('accounting');
    } else if (role.key === 'accountant') {
      test.info().annotations.push({ type: 'todo', description: 'PR #83: Accountant → Settings → Accounting not on dev yet' });
    }
    if (sections.length > 0) {
      await page.goto(`/${locale}/settings`);
      await settled(page);
      const menu = page.getByRole('navigation', { name: t(locale, 'settings.sectionsLabel') });
      const buttons = menu.getByRole('button');
      await expect(buttons).toHaveCount(sections.length);
      for (const [i, id] of sections.entries()) {
        await expect(buttons.nth(i)).toContainText(t(locale, `settings.sections.${id}.title`));
      }
      await expect(buttons.first()).toHaveAttribute('aria-current', 'page');
      await expect(failed, `${role.key}: Settings opens on a section it may view`).toHaveCount(0);

      // A link to a section it can't view opens its first one instead (no refused request).
      const hidden = (Object.keys(SETTINGS_SECTION_ACCESS) as (keyof typeof SETTINGS_SECTION_ACCESS)[]).find(
        (id) => !sections.includes(id),
      );
      if (hidden) {
        await page.goto(`/${locale}/settings?section=${hidden}`);
        await settled(page);
        await expect(buttons.first()).toHaveAttribute('aria-current', 'page');
        await expect(failed, `${role.key}: ?section=${hidden} falls back to a section it may view`).toHaveCount(0);
      }
    }
    await page.context().close();
  });
}
