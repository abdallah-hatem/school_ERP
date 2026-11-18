import type { NotificationItem, NotificationItemEntry } from '@school-erp/shared';
import { describe, expect, it } from 'vitest';
import { createTranslator, getBaseMessages, hasMessage, mergeMessages, type Locale } from '@/shared/lib/i18n';
import { notificationMessages } from '../messages';
import { badgeText, groupItemText, linkHref, notificationText, resolvedText, whenText } from './text';

const NOW = '2026-11-18T10:00:00.000Z'; // 12:00 in Cairo

function deps(locale: Locale) {
  const messages = mergeMessages(getBaseMessages(locale), notificationMessages(locale));
  return { t: createTranslator(messages, locale), has: (k: string) => hasMessage(messages, k), locale, now: NOW };
}

const omar = { en: 'Omar Khalil', ar: 'عمر خليل' };
const salma = { en: 'Salma Nabil', ar: 'سلمى نبيل' };
const amr = { en: 'Amr Fawzy', ar: 'عمرو فوزي' };
const late = { en: 'Late to class', ar: 'التأخر عن الحصة' };

function entry(params: Record<string, unknown>, id = 'i1'): NotificationItemEntry {
  return { id, params, link: { screen: 'penalties', query: { penalty: id } }, resolved: null };
}

function notification(type: string, items: NotificationItemEntry[], extra: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n1',
    type,
    module: 'hr',
    category: 'approval',
    params: { ...(items[0]?.params ?? {}), count: items.length },
    link: items.length === 1 ? (items[0]?.link ?? null) : null,
    items,
    openCount: items.length,
    createdAt: NOW,
    updatedAt: NOW,
    readAt: null,
    resolved: null,
    ...extra,
  };
}

describe('notification sentences (N3, N17)', () => {
  it('a single penalty reads as itself, in either language', () => {
    const n = notification('hr.penalty.awaiting_approval', [entry({ employee: omar, violation: late, level: 2 })]);
    expect(notificationText(n, deps('en'))).toEqual({
      title: 'Penalty waiting for your approval',
      body: 'Omar Khalil · Late to class, level 2',
    });
    expect(notificationText(n, deps('ar'))).toEqual({
      title: 'جزاء في انتظار اعتمادك',
      body: 'عمر خليل · التأخر عن الحصة، المرة 2',
    });
  });

  it('three penalties read as their group with the first names and "and 1 more"', () => {
    const items = [omar, salma, amr].map((employee, i) => entry({ employee, violation: late, level: 1 }, `i${i}`));
    const n = notification('hr.penalty.awaiting_approval', items);
    expect(notificationText(n, deps('en'))).toEqual({
      title: '3 penalties waiting for your approval',
      body: 'Omar Khalil, Salma Nabil and 1 more',
    });
    expect(notificationText(n, deps('ar'))).toEqual({
      title: '3 جزاءات في انتظار اعتمادك',
      body: 'عمر خليل، سلمى نبيل وواحد آخر',
    });
    expect(groupItemText(n.type, items[1]!, deps('en'))).toEqual({ main: 'Salma Nabil', detail: 'Late to class, level 1' });
  });

  it('payroll ready: the employees in the right plural, the net with its label only when sent (salary-blind readers)', () => {
    const run = (params: Record<string, unknown>) => notification('hr.payroll.ready_to_approve', [entry(params)]);
    // The single item's own count (38 employees), not the group's 1.
    expect(notificationText(run({ month: '2026-11', count: 38, net: 41_256_000 }), deps('en'))).toEqual({
      title: 'November 2026 payroll is ready to approve',
      body: '38 employees, net EGP\u00a0412,560.00',
    });
    expect(notificationText(run({ month: '2026-11', count: 38, net: 41_256_000 }), deps('ar')).body).toBe(
      '38 موظفًا، الصافي 412,560.00\u00a0ج.م',
    );
    expect(notificationText(run({ month: '2026-11', count: 1 }), deps('ar')).body).toBe('موظف واحد');
    expect(notificationText(run({ month: '2026-11', count: 2 }), deps('ar')).body).toBe('موظفان');
  });

  it('contracts: "in 7 days" counted from the school’s today; a group all on one date says so', () => {
    const one = notification('hr.contract.ending_soon', [entry({ employee: omar, date: '2026-11-25', days: 30 })]);
    expect(notificationText(one, deps('en'))).toEqual({ title: "Omar Khalil's contract ends 25 November 2026", body: 'in 7 days' });
    expect(notificationText(one, deps('ar')).body).toBe('بعد 7 أيام');
    const group = notification(
      'hr.contract.ending_soon',
      [omar, salma].map((employee, i) => entry({ employee, date: '2026-12-31', days: 30 }, `c${i}`)),
    );
    expect(notificationText(group, deps('en'))).toEqual({ title: '2 contracts end within 30 days', body: 'All on 31 December 2026' });
    expect(notificationText(group, deps('ar')).title).toBe('ينتهي عقدان خلال 30 يومًا');
  });

  it('a type the screen does not know still reads (as "Notifications"), never a raw key', () => {
    expect(notificationText(notification('fees.invoice.overdue', [entry({})]), deps('en')).title).toBe('Notifications');
  });

  it('resolved: "Approved by …" for one item, "All done" for a group', () => {
    const resolved = { at: NOW, by: { en: 'Laila Hassan', ar: 'ليلى حسن' }, resolution: 'approved' as const };
    expect(resolvedText(resolved, deps('en'))).toBe('Approved by Laila Hassan');
    expect(resolvedText(resolved, deps('ar'))).toBe('اعتمده ليلى حسن');
    expect(resolvedText({ ...resolved, resolution: 'cancelled' }, deps('en'))).toBe('Cancelled by Laila Hassan');
    expect(resolvedText(resolved, deps('en'), true)).toBe('All done');
  });
});

describe('when it happened (school time)', () => {
  it.each([
    ['2026-11-18T09:57:00.000Z', '3 min ago', 'منذ 3 دقائق'],
    ['2026-11-18T08:58:00.000Z', '1 h ago', 'منذ ساعة'],
    ['2026-11-18T05:00:00.000Z', '5 h ago', 'منذ 5 ساعات'],
    ['2026-11-18T03:00:00.000Z', 'Today, 05:00', 'اليوم، 05:00'],
    ['2026-11-17T05:00:00.000Z', 'Yesterday, 07:00', 'أمس، 07:00'],
    ['2026-11-16T08:42:00.000Z', '16 Nov, 10:42', '16 نوفمبر، 10:42'],
  ])('%s → %s', (at, en, ar) => {
    expect(whenText(at, NOW, deps('en'))).toBe(en);
    expect(whenText(at, NOW, deps('ar'))).toBe(ar);
  });
});

describe('links and the badge', () => {
  it('builds the page a link opens, in the screen’s language', () => {
    expect(linkHref({ screen: 'penalties', query: { penalty: 'p-1' } }, 'en')).toBe('/en/penalties?penalty=p-1');
    expect(linkHref({ screen: 'payrollRun', recordId: 'r-1' }, 'ar')).toBe('/ar/payroll/r-1');
    expect(linkHref({ screen: 'lateness', query: { month: '2026-11' } }, 'en')).toBe('/en/lateness?month=2026-11');
    // A record screen without its record, or a screen that doesn't exist, opens nothing.
    expect(linkHref({ screen: 'employee' }, 'en')).toBeNull();
    expect(linkHref({ screen: 'nowhere' as never }, 'en')).toBeNull();
    expect(linkHref(null, 'en')).toBeNull();
  });

  it('shows the real number up to 99, then 99+', () => {
    expect([0, 7, 99, 100, 1284].map((n) => badgeText(n, 99))).toEqual(['0', '7', '99', '99+', '99+']);
  });
});
