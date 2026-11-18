import { expect, request, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { monthOf, PAGINATION, PayrollStatus, type Language, type PayrollRun, type PayrollRunSummary, type EmployeeSummary, type PenaltyRecord, type UserAccount } from '@school-erp/shared';
import { join } from 'node:path';
import { Api } from './api';
import { env } from './env';
import { adminAccount, makeUser, rolesByKey } from './access';
import { signIn } from './ui';

/*
 * Skeletons match the screens they stand in for (owner, 2026-11-18): any change to a component
 * that doesn't update its skeleton fails here.
 *
 * Both sides mark their main content blocks with `data-skeleton-block="<name>"` (PageHeader,
 * DataTable, StatTile, FormActionBar and the screen's own cards carry it, so a skeleton built
 * from them is marked for free). For each screen this reads the blocks twice:
 *
 *   - the skeleton: the server's first paint with JavaScript off. The route's `loading.tsx` (or a
 *     Suspense fallback, or a client section's loading state) is streamed first and the real
 *     content arrives hidden, swapped in by a script that never runs — so the skeleton stays.
 *   - the loaded screen: the same URL with JavaScript on, once nothing in `#main` is aria-busy.
 *
 * and expects the same blocks in the same order, each as wide and as tall as the other within
 * tolerance(). A list's items carry `data-skeleton-each` too: a run of them counts once, as tall
 * as its shortest item (how many arrive, and whose name wraps, is data). `data-skeleton-measure="width"` on a block compares its
 * width only (a list whose height follows its row count).
 */

export interface MeasuredBlock {
  name: string;
  width: number;
  height: number;
  measure: 'size' | 'width';
  /** The loaded block's text, shown when it doesn't match (what wrapped). */
  text?: string;
}

/** ±8px, or ±5% for blocks over 160px. */
export function tolerance(a: number, b: number): number {
  return Math.max(8, 0.05 * Math.max(a, b));
}

async function blocksOf(page: Page): Promise<MeasuredBlock[]> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.evaluate(() => {
    const out: { name: string; width: number; height: number; measure: 'size' | 'width'; text: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('#main [data-skeleton-block]'))) {
      const r = el.getBoundingClientRect();
      // Not drawn: the other view of a table (cards on desktop), a hidden streamed tree.
      if (r.width === 0 || r.height === 0) continue;
      const name = el.dataset.skeletonBlock ?? '';
      // One of many (a row, a card in a list): one entry for the run, as tall as its shortest item —
      // a skeleton row traces a plain row, not one whose name or chips wrap onto a second line.
      const each = el.hasAttribute('data-skeleton-each');
      const last = out.at(-1);
      if (each && last?.name === name) {
        last.height = Math.min(last.height, Math.round(r.height * 10) / 10);
        continue;
      }
      out.push({
        name,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        measure: el.dataset.skeletonMeasure === 'width' ? 'width' : 'size',
        text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      });
    }
    return out;
  });
}

/** The page has nothing left to load: no busy region, images decoded, the network quiet. */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
}

export interface SkeletonScreen {
  name: string;
  /** Path after `/<locale>`, e.g. `/employees`. */
  path: string;
}


/** Measures one screen in one language and returns the readable mismatches (empty = they match). */
export async function compareScreen(browser: Browser, page: Page, locale: Language, screen: SkeletonScreen, info: TestInfo) {
  const url = `/${locale}${screen.path}`;
  const noScript = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    viewport: page.viewportSize(),
    deviceScaleFactor: 1,
    locale: locale === 'ar' ? 'ar-EG' : 'en-US',
    baseURL: new URL(page.url()).origin,
  });
  const skeletonPage = await noScript.newPage();
  await skeletonPage.goto(url);
  await expect(skeletonPage.locator('#main [aria-busy="true"]').first(), `${screen.name}: a skeleton is drawn`).toBeAttached();
  const skeleton = await blocksOf(skeletonPage);
  const shotDir = `${info.project.name}/skeletons`;
  await skeletonPage.screenshot({ path: shotPath(`${shotDir}/${screen.name}-${locale}-skeleton.png`), fullPage: true });
  await noScript.close();

  await page.goto(url);
  await settled(page);
  const loaded = await blocksOf(page);
  await page.screenshot({ path: shotPath(`${shotDir}/${screen.name}-${locale}-loaded.png`), fullPage: true });

  return diff(skeleton, loaded);
}

function shotPath(name: string): string {
  return join(__dirname, '..', 'screenshots', name);
}

export function diff(skeleton: MeasuredBlock[], loaded: MeasuredBlock[]): string[] {
  const problems: string[] = [];
  const names = (list: MeasuredBlock[]) => list.map((b) => b.name).join(' › ');
  const sized = (list: MeasuredBlock[]) => list.map((b) => `${b.name} ${b.width}×${b.height}`).join(' › ');
  if (names(skeleton) !== names(loaded)) {
    problems.push(`blocks differ\n    skeleton: ${sized(skeleton)}\n    loaded:   ${sized(loaded)}`);
    return problems;
  }
  skeleton.forEach((s, i) => {
    const l = loaded[i]!;
    const keys: ('width' | 'height')[] = s.measure === 'width' || l.measure === 'width' ? ['width'] : ['width', 'height'];
    for (const key of keys) {
      if (Math.abs(s[key] - l[key]) > tolerance(s[key], l[key])) {
        problems.push(`#${i} ${s.name}.${key}: skeleton ${s[key]} vs loaded ${l[key]} — loaded: "${l.text ?? ''}"`);
      }
    }
  });
  return problems;
}

/** A new account that has already chosen its own password (no "must choose" note on its page). */
async function settledUser(api: Api, roleId: string): Promise<UserAccount> {
  const user = await makeUser(api, { name: 'Skeleton Check', roleIds: [roleId] });
  const ctx = await request.newContext({ baseURL: env.apiUrl });
  try {
    const login = await ctx.post('/auth/login', { data: { email: user.email, password: user.password } });
    expect(login.ok(), 'skeleton spec: the new user signs in').toBe(true);
    const set = await ctx.post('/account/password', { data: { newPassword: `Own-${Date.now()}-Pass9` } });
    expect(set.ok(), 'skeleton spec: the new user sets their own password').toBe(true);
  } finally {
    await ctx.dispose();
  }
  return user;
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Every screen with a skeleton, in menu order. */
export const SKELETON_SCREENS = [
  'dashboard',
  'employees',
  'employee-details',
  'employee-penalties',
  'employee-payroll',
  'employee-history',
  'employee-new',
  'employee-edit',
  'penalties',
  'lateness',
  'payroll',
  'payroll-run',
  'payslip',
  'payroll-taxes',
  'payroll-taxes-month',
  'activity',
  'users',
  'user-new',
  'user-edit',
  'roles',
  'role-new',
  'role-edit',
  'account',
  'settings-school',
  'settings-structure',
  'settings-lists',
  'settings-hr-rules',
  'settings-catalogue',
] as const;
export type SkeletonScreenName = (typeof SKELETON_SCREENS)[number];

let paths: Promise<Record<SkeletonScreenName, string | null>> | null = null;

/** Each screen's path, with real ids from the database the specs run against (read once). */
export function screenPaths(): Promise<Record<SkeletonScreenName, string | null>> {
  paths ??= readPaths();
  return paths;
}

async function readPaths(): Promise<Record<SkeletonScreenName, string | null>> {
  const api = await Api.asAdmin();
  try {
    const employees = await api.get<EmployeeSummary[]>('/hr/employees', { limit: 1 });
    if (!employees[0]) throw new Error('smoke: no employee to open');
    // The profile of someone with a penalty (03-penalties records some), so the Penalties tab
    // shows rows rather than its empty state.
    const penalties = await api.get<PenaltyRecord[]>('/hr/penalties', { limit: 1 });
    const employee = penalties[0]?.employee ?? employees[0];
    // The payslip exists only on an approved run (05-payroll approves one).
    let runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
    if (runs.length === 0) {
      await api.post('/hr/payroll-runs', { month: monthOf(new Date()) });
      runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
    }
    const approved = runs.find((r) => r.status === PayrollStatus.APPROVED);
    const run = await api.get<PayrollRun>(`/hr/payroll-runs/${(approved ?? runs[0]!).id}`);
    const line = approved ? run.lines[0] : undefined;
    const admin = await adminAccount(api);
    const roles = await rolesByKey(api);
    // A plain account (one role) besides the admin, as every school has: the Users rows' shape.
    const users = await api.get<UserAccount[]>('/users', { limit: PAGINATION.maxLimit, status: 'active' });
    // A user's page as most are: an active account that isn't the last System admin (whose page
    // adds a "can't deactivate" note).
    const plain = users.find((u) => u.id !== admin.id && !u.mustChangePassword) ?? (await settledUser(api, roles.get('hr_officer')?.id ?? ''));
    const role = roles.get('direct_manager') ?? [...roles.values()][0]!;
    // The History tab compares its pagination too, which shows only with entries: an employee
    // has one from their first write (T28); on an older database, a grade edit put back adds two.
    const history = await api.get<unknown[]>(`/audit/records/employee/${employee.id}`, { limit: 1 });
    if (history.length === 0) {
      const { grade } = await api.get<{ grade: string | null }>(`/hr/employees/${employee.id}`);
      await api.patch(`/hr/employees/${employee.id}`, { grade: 'Skeleton check' });
      await api.patch(`/hr/employees/${employee.id}`, { grade });
    }
    const e = `/employees/${employee.id}`;
    return {
      dashboard: '',
      employees: '/employees',
      'employee-details': e,
      'employee-penalties': `${e}/penalties`,
      'employee-payroll': `${e}/payroll`,
      'employee-history': `${e}/history`,
      'employee-new': '/employees/new',
      'employee-edit': `${e}/edit`,
      penalties: '/penalties',
      // Last month: this month's payroll may be approved (05-payroll), which locks its lateness
      // board and drops its Save button — a state the skeleton can't know.
      lateness: `/lateness?month=${previousMonth(monthOf(new Date()))}`,
      payroll: '/payroll',
      'payroll-run': `/payroll/${run.id}`,
      payslip: line ? `/payroll/${run.id}/payslip/${line.id}` : null,
      // The year of an approved month (its tiles in every state), and that month's statement (§10).
      'payroll-taxes': `/accounting/payroll-taxes?year=${(approved?.month ?? monthOf(new Date())).slice(0, 4)}`,
      'payroll-taxes-month': approved ? `/accounting/payroll-taxes/${approved.month}` : null,
      activity: '/activity',
      users: '/users',
      'user-new': '/users/new',
      'user-edit': `/users/${plain.id}`,
      roles: '/roles',
      'role-new': '/roles/new',
      'role-edit': `/roles/${role.id}`,
      account: '/account',
      'settings-school': '/settings?section=school',
      'settings-structure': '/settings?section=structure',
      'settings-lists': '/settings?section=lists',
      'settings-hr-rules': '/settings?section=hrRules',
      'settings-catalogue': '/settings?section=catalogue',
    };
  } finally {
    await api.dispose();
  }
}

/**
 * The spec body, shared by the desktop and phone files: one test per screen, each comparing its
 * skeleton with the loaded screen in every language given.
 */
export function defineSkeletonSpecs(locales: readonly Language[]): void {
  for (const name of SKELETON_SCREENS) {
    test(`${name}: the skeleton has the loaded screen's blocks, in order and size`, async ({ page, browser }, info) => {
      const path = (await screenPaths())[name];
      test.skip(path === null, 'no approved payroll run to open (a payslip, a payroll taxes statement)');
      await signIn(page, locales[0]!);
      const problems: string[] = [];
      for (const locale of locales) {
        for (const p of await compareScreen(browser, page, locale, { name, path: path! }, info)) problems.push(`[${locale}] ${p}`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
}
