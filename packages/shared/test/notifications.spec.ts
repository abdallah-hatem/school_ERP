import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_ICON_DEFAULT_VERSION,
  APP_ICON_NAMES,
  AUDIT_ACTIONS,
  BUILT_IN_ROLES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFERENCE_CHANNELS,
  appIconPath,
  appIconVersion,
  notificationLinkPath,
  preferenceChannelOf,
  NOTIFICATION_MODULES,
  NOTIFICATION_TYPE_KEYS,
  NOTIFICATION_TYPES,
  NotificationSettingKey,
  PERMISSIONS,
  SCREENS,
  SETTING_DEFAULTS,
  isNotificationTypeKey,
  notificationDedupeKey,
  schoolDayOf,
} from '../src';

type Tree = { [k: string]: string | Tree };

const load = (lang: string): Tree =>
  JSON.parse(readFileSync(join(__dirname, '..', 'locales', lang, 'notifications.json'), 'utf8')) as Tree;

function at(tree: Tree, path: string): string | Tree | undefined {
  return path
    .split('.')
    .reduce<string | Tree | undefined>((node, part) => (node && typeof node === 'object' ? node[part] : undefined), tree);
}

const RULES = { en: new Intl.PluralRules('en'), ar: new Intl.PluralRules('ar') };

/** The form a count picks, the way both apps pick it (`Intl.PluralRules`), filled in. */
function render(message: Tree, lang: 'en' | 'ar', count: number): string {
  const form = message[RULES[lang].select(count)] ?? message.other;
  return (form as string).replace('{count}', String(count));
}

describe('notification types (N2)', () => {
  const en = load('en');
  const ar = load('ar');

  it('every key is <module>.<thing>.<event>, starts with its module and names a real permission', () => {
    for (const key of NOTIFICATION_TYPE_KEYS) {
      const type = NOTIFICATION_TYPES[key];
      expect(key).toMatch(/^[a-z]+\.[a-z_]+\.[a-z_]+$/);
      expect(NOTIFICATION_MODULES).toContain(type.module);
      expect(key.startsWith(`${type.module}.`)).toBe(true);
      expect(Object.keys(PERMISSIONS)).toContain(type.permission);
      for (const c of type.defaultChannels) expect(NOTIFICATION_CHANNELS).toContain(c);
    }
  });

  it('holds the spec’s seven first types; approvals can’t be turned off, reminders can (owner, 2026-11-18)', () => {
    expect([...NOTIFICATION_TYPE_KEYS].sort()).toEqual(
      [
        'hr.contract.ending_soon',
        'hr.lateness.not_entered',
        'hr.payroll.not_approved',
        'hr.payroll.not_prepared',
        'hr.payroll.ready_to_approve',
        'hr.payroll.returned_by_accounting',
        'hr.penalty.awaiting_approval',
        'hr.probation.ending_soon',
      ].sort(),
    );
    for (const key of NOTIFICATION_TYPE_KEYS) {
      const type = NOTIFICATION_TYPES[key];
      expect({ key, canTurnOff: type.canTurnOff }).toEqual({ key, canTurnOff: type.category !== 'approval' });
    }
  });

  it('two channels: the bell and push; only the bell has per-type switches (owner, 2026-11-21)', () => {
    expect(NOTIFICATION_CHANNELS).toEqual(['in_app', 'push']);
    expect(NOTIFICATION_PREFERENCE_CHANNELS).toEqual(['in_app']);
    expect(preferenceChannelOf('push')).toBe('in_app');
    expect(preferenceChannelOf('in_app')).toBe('in_app');
  });

  it('a link opens the same page from the bell and from a push (notificationLinkPath)', () => {
    expect(notificationLinkPath({ screen: 'penalties', query: { penalty: 'p1' } }, 'en')).toBe('/en/penalties?penalty=p1');
    expect(notificationLinkPath({ screen: 'payrollRun', recordId: 'r 1' }, 'ar')).toBe(
      `/ar${SCREENS.payrollRun.path.replace(':id', 'r%201')}`,
    );
    expect(notificationLinkPath({ screen: 'payrollRun' }, 'en')).toBeNull();
    expect(notificationLinkPath(null, 'en')).toBeNull();
  });

  it('a device for alerts is audited, added and removed (2026-11-21)', () => {
    expect(AUDIT_ACTIONS['core.push_device.add'].entityType).toBe('push_device');
    expect(AUDIT_ACTIONS['core.push_device.remove'].entityType).toBe('push_device');
  });

  it('the app icons are versioned by the logo URL: a new logo, new URLs; no logo, the generic icon', () => {
    const a = appIconVersion('/files/logo/logo-a.png');
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(appIconVersion('/files/logo/logo-a.png')).toBe(a);
    expect(appIconVersion('/files/logo/logo-b.png')).not.toBe(a);
    expect(appIconVersion(null)).toBe(APP_ICON_DEFAULT_VERSION);
    expect(appIconPath('icon-192.png', '/files/logo/logo-a.png')).toBe(`/files/app-icon/icon-192.png?v=${a}`);
    expect(APP_ICON_NAMES).toEqual([
      'icon-192.png',
      'icon-512.png',
      'maskable-512.png',
      'apple-touch-icon.png',
      'favicon-32.png',
      'badge-96.png',
    ]);
  });

  it.each(NOTIFICATION_TYPE_KEYS)('%s has its name, title and group texts in English and Arabic', (key) => {
    for (const [lang, tree] of [
      ['en', en],
      ['ar', ar],
    ] as const) {
      for (const part of ['name', 'title']) {
        const text = at(tree, `types.${key}.${part}`);
        expect({ lang, part, type: typeof text }).toEqual({ lang, part, type: 'string' });
        if (lang === 'ar') expect(text).toMatch(/[؀-ۿ]/);
      }
      // `group`: what still waits; `groupDone`: a group with every item handled.
      for (const part of ['group', 'groupDone']) {
        const forms = at(tree, `types.${key}.${part}`) as Tree;
        expect({ part, forms: Object.keys(forms ?? {}).sort() }).toEqual({
          part,
          forms: ['few', 'many', 'one', 'other', 'two', 'zero'],
        });
      }
    }
  });

  it('the locale files hold texts for no type outside the registry', () => {
    const typePaths = (tree: Tree, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([k, v]) =>
        typeof v !== 'object' ? [] : typeof v.name === 'string' ? [`${prefix}${k}`] : typePaths(v, `${prefix}${k}.`),
      );
    for (const tree of [en, ar]) expect(typePaths(at(tree, 'types') as Tree).sort()).toEqual([...NOTIFICATION_TYPE_KEYS].sort());
  });

  it('every type’s link opens a real screen', () => {
    for (const key of NOTIFICATION_TYPE_KEYS) {
      const link = NOTIFICATION_TYPES[key].link({ entityType: 'x', entityId: 'id-1', employeeId: 'emp-1' }, { month: '2026-11' });
      expect(link && Object.keys(SCREENS)).toContain(link?.screen);
    }
  });

  it('builds dedupe keys from the type’s prefix (N9)', () => {
    expect(notificationDedupeKey('hr.contract.ending_soon', 'emp-1', '2027-05-31', 30)).toBe(
      'contract_end:emp-1:2027-05-31:30',
    );
    expect(notificationDedupeKey('hr.penalty.awaiting_approval', 'p-1')).toBe('penalty:p-1');
    expect(isNotificationTypeKey('hr.penalty.awaiting_approval')).toBe(true);
    expect(isNotificationTypeKey('hr.penalty.nope')).toBe(false);
    expect(isNotificationTypeKey('toString')).toBe(false);
  });
});

describe('notification texts: Arabic plural forms (edge case 24)', () => {
  const ar = load('ar');
  const en = load('en');
  const countTexts = (tree: Tree): [string, Tree][] => {
    const out: [string, Tree][] = [];
    const walk = (node: Tree, path: string) => {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v !== 'object') continue;
        if (typeof v.other === 'string') out.push([`${path}${k}`, v]);
        else walk(v, `${path}${k}.`);
      }
    };
    walk(tree, '');
    return out;
  };

  it('0, 1, 2, 3, 10, 11, 100 each pick the right Arabic form', () => {
    expect(['zero', 'one', 'two', 'few', 'few', 'many', 'other']).toEqual(
      [0, 1, 2, 3, 10, 11, 100].map((n) => RULES.ar.select(n)),
    );
    expect(render(at(ar, 'bell.unread') as Tree, 'ar', 1)).toBe('إشعار واحد غير مقروء');
    expect(render(at(ar, 'bell.unread') as Tree, 'ar', 2)).toBe('إشعاران غير مقروءين');
    expect(render(at(ar, 'bell.unread') as Tree, 'ar', 3)).toBe('3 إشعارات غير مقروءة');
    expect(render(at(ar, 'bell.unread') as Tree, 'ar', 11)).toBe('11 إشعارًا غير مقروء');
    expect(render(at(ar, 'bell.unread') as Tree, 'ar', 100)).toBe('100 إشعار غير مقروء');
    const employees = at(ar, 'types.hr.payroll.ready_to_approve.bodyWithoutNet') as Tree;
    expect([1, 2, 3, 10, 11, 38].map((n) => render(employees, 'ar', n))).toEqual([
      'موظف واحد',
      'موظفان',
      '3 موظفين',
      '10 موظفين',
      '11 موظفًا',
      '38 موظفًا',
    ]);
  });

  it('every count text renders a distinct, non-empty form for each Arabic plural category', () => {
    for (const [path, message] of countTexts(ar)) {
      const rendered = [0, 1, 2, 3, 11, 100].map((n) => render(message, 'ar', n));
      for (const text of rendered) expect({ path, ok: text.trim().length > 0 }).toEqual({ path, ok: true });
      // few (3) and many (11) carry the number; one and two say it in words.
      expect(rendered[3]).toContain('3');
      expect(rendered[4]).toContain('11');
    }
    for (const [path, message] of countTexts(en)) {
      expect({ path, one: render(message, 'en', 1).length > 0 }).toEqual({ path, one: true });
    }
  });
});

describe('notification settings, permissions and audit keys', () => {
  it('retention defaults are 90 / 30 / 365 days (owner, 2026-11-18)', () => {
    expect(SETTING_DEFAULTS[NotificationSettingKey.RETENTION_READ_DAYS]).toBe(90);
    expect(SETTING_DEFAULTS[NotificationSettingKey.RETENTION_RESOLVED_DAYS]).toBe(30);
    expect(SETTING_DEFAULTS[NotificationSettingKey.RETENTION_MAX_DAYS]).toBe(365);
  });

  it('the System admin manages notification settings; the HR manager only views them (owner, 2026-11-18)', () => {
    const holders = (key: 'core.notifications.view' | 'core.notifications.manage') =>
      BUILT_IN_ROLES.filter((r) => r.permissions[key] === 'all')
        .map((r) => r.key)
        .sort();
    expect(holders('core.notifications.view')).toEqual(['hr_manager', 'system_admin']);
    expect(holders('core.notifications.manage')).toEqual(['system_admin']);
  });

  it('both writes are audit actions', () => {
    expect(AUDIT_ACTIONS['core.notification_preferences.update'].entityType).toBe('notification_preferences');
    expect(AUDIT_ACTIONS['core.notification_settings.update'].entityType).toBe('notification_settings');
  });

  it('the school day is Cairo’s: 22:30 UTC on 30 November is 1 December (edge case 6)', () => {
    expect(schoolDayOf(new Date('2026-11-30T22:30:00Z'))).toBe('2026-12-01');
    expect(schoolDayOf(new Date('2026-11-30T21:30:00Z'))).toBe('2026-11-30');
  });
});
