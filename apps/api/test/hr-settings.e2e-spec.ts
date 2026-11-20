import { INestApplication } from '@nestjs/common';
import {
  HrSettingKey,
  latenessDays,
  SettingsEvent,
  type AuthUser,
  type HrSettings,
  type SettingsChangedEvent,
} from '@school-erp/shared';
import { EventListeners } from '../src/core/events/event-listeners';
import { DatabaseService } from '../src/database/database.service';
import { http } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';
import { historyMark, historyRows } from './helpers/history';

const HR_KEYS = Object.values(HrSettingKey);

describe('HR rule settings — /hr/settings (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  let events: SettingsChangedEvent[];
  let mark = BigInt(0);

  const patch = (body: unknown) =>
    http(app)
      .patch('/hr/settings')
      .send(body as object);
  const getSettings = async (): Promise<HrSettings> =>
    (await http(app).get('/hr/settings').expect(200)).body.data as HrSettings;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    // A real listener: it hears core.settings.changed only after the commit, as any listener does.
    app.get(EventListeners).addInMemory(SettingsEvent.CHANGED, 'HrSettingsSpec', {
      handle: (e) => (events.push(e as SettingsChangedEvent), Promise.resolve()),
    });
  });

  beforeEach(async () => {
    await db.schoolSetting.deleteMany({ where: { key: { in: HR_KEYS } } });
    mark = await historyMark(db);
    events = [];
  });

  afterAll(async () => {
    await db.schoolSetting.deleteMany({ where: { key: { in: HR_KEYS } } });
    await app.close();
  });

  it('Fresh database: HR settings = grace 0, steps 1→0.25 and 2→0.5, extra 0.5, divisor 30, 80/60/40, CONTRACT_YEAR, probation 3 months, reminders 30/7/7/25/28', async () => {
    const res = await http(app).get('/hr/settings').expect(200);
    expect(res.body).toMatchObject({ success: true, statusCode: 200 });
    expect(res.body.data).toEqual({
      lateness: {
        graceMinutes: 0,
        steps: [
          { hour: 1, days: 0.25 },
          { hour: 2, days: 0.5 },
        ],
        extraHourDays: 0.5,
      },
      payroll: { dayDivisor: 30, partTime: { PART_TIME_4: 80, PART_TIME_3: 60, PART_TIME_2: 40 } },
      penalties: { repetitionWindow: 'CONTRACT_YEAR' },
      employees: { defaultProbationMonths: 3 },
      reminders: {
        contractEndDays: 30,
        contractEndSecondDays: 7,
        probationEndDays: 7,
        latenessCheckDay: 25,
        payrollCheckDay: 28,
      },
    });
  });

  describe('Settings PATCH: percentages outside 1–100 → 400; divisor outside 1–31 → 400; days not in 0.25 steps → 400', () => {
    it.each([
      ['percent 0', { payroll: { partTime: { PART_TIME_4: 0 } } }],
      ['percent 101', { payroll: { partTime: { PART_TIME_2: 101 } } }],
      ['percent 50.5', { payroll: { partTime: { PART_TIME_3: 50.5 } } }],
      ['divisor 0', { payroll: { dayDivisor: 0 } }],
      ['divisor 32', { payroll: { dayDivisor: 32 } }],
      ['divisor 30.5', { payroll: { dayDivisor: 30.5 } }],
      ['step days 0.1', { lateness: { steps: [{ hour: 1, days: 0.1 }] } }],
      ['extra-hour days 0.6', { lateness: { extraHourDays: 0.6 } }],
    ])('%s → 400, nothing saved', async (_label, body) => {
      const res = await patch(body).expect(400);
      expect(res.body).toMatchObject({ success: false, error: 'VALIDATION_FAILED' });
      expect(await db.schoolSetting.count({ where: { key: { in: HR_KEYS } } })).toBe(0);
      expect(events).toHaveLength(0);
    });
  });

  describe('Settings: step days 0.3 / −0.25 / 30.25 → 400; extra-hour days likewise; duplicate or non-sequential hours or negative grace → 400; invalid repetitionWindow → 400; a part-time key other than 4/3/2 → 400', () => {
    it.each([
      ['step days 0.3', { lateness: { steps: [{ hour: 1, days: 0.3 }] } }],
      ['step days −0.25', { lateness: { steps: [{ hour: 1, days: -0.25 }] } }],
      ['step days 30.25', { lateness: { steps: [{ hour: 1, days: 30.25 }] } }],
      ['extra-hour days 0.3', { lateness: { extraHourDays: 0.3 } }],
      ['extra-hour days −0.25', { lateness: { extraHourDays: -0.25 } }],
      ['extra-hour days 30.25', { lateness: { extraHourDays: 30.25 } }],
      [
        'duplicate hours',
        {
          lateness: {
            steps: [
              { hour: 1, days: 0.25 },
              { hour: 1, days: 0.5 },
            ],
          },
        },
      ],
      [
        'non-sequential hours (1, 3)',
        {
          lateness: {
            steps: [
              { hour: 1, days: 0.25 },
              { hour: 3, days: 0.5 },
            ],
          },
        },
      ],
      ['steps not starting at hour 1', { lateness: { steps: [{ hour: 2, days: 0.5 }] } }],
      ['empty steps', { lateness: { steps: [] } }],
      ['negative grace', { lateness: { graceMinutes: -1 } }],
      ['fractional grace', { lateness: { graceMinutes: 1.5 } }],
      ['invalid repetitionWindow', { penalties: { repetitionWindow: 'WEEKLY' } }],
      ['part-time key other than 4/3/2', { payroll: { partTime: { PART_TIME_5: 50 } } }],
      ['FULL_TIME part-time key', { payroll: { partTime: { FULL_TIME: 90 } } }],
      ['unknown top-level key', { tax: { rate: 10 } }],
      ['unknown nested key', { lateness: { graceMinutes: 5, hours: 3 } }],
      ['null value', { payroll: { dayDivisor: null } }],
      ['null section', { lateness: null }],
      ['section as a string', { payroll: 'thirty' }],
      ['days as a string', { lateness: { extraHourDays: '0.5' } }],
      ['probation 7 months (N0: 0–6)', { employees: { defaultProbationMonths: 7 } }],
      ['probation −1 months', { employees: { defaultProbationMonths: -1 } }],
      ['probation 1.5 months', { employees: { defaultProbationMonths: 1.5 } }],
      ['probation null', { employees: { defaultProbationMonths: null } }],
      ['unknown employees key', { employees: { probationDays: 90 } }],
      // N3 edge 15: reminder timings (spec → Reminder settings).
      ['lateness check day 0', { reminders: { latenessCheckDay: 0 } }],
      ['payroll check day 32', { reminders: { payrollCheckDay: 32 } }],
      ['contract reminder −1 days', { reminders: { contractEndDays: -1 } }],
      ['contract reminder 121 days', { reminders: { contractEndDays: 121 } }],
      ['second contract reminder −1', { reminders: { contractEndSecondDays: -1 } }],
      ['probation reminder 0 days', { reminders: { probationEndDays: 0 } }],
      ['probation reminder 2.5 days', { reminders: { probationEndDays: 2.5 } }],
      ['reminders null', { reminders: null }],
      ['second contract reminder = the first (30)', { reminders: { contractEndSecondDays: 30 } }],
      ['second contract reminder above the first', { reminders: { contractEndDays: 10, contractEndSecondDays: 20 } }],
    ])('%s → 400, nothing saved', async (_label, body) => {
      const res = await patch(body).expect(400);
      expect(res.body).toMatchObject({ success: false, statusCode: 400 });
      expect(await db.schoolSetting.count({ where: { key: { in: HR_KEYS } } })).toBe(0);
      expect(events).toHaveLength(0);
    });

    it('valid bounds are accepted: percent 1 and 100, divisor 1 and 31, days 0 and 30', async () => {
      await patch({
        payroll: { dayDivisor: 1, partTime: { PART_TIME_4: 100, PART_TIME_2: 1 } },
        lateness: { extraHourDays: 30, steps: [{ hour: 1, days: 0 }] },
      }).expect(200);
      await patch({ payroll: { dayDivisor: 31 } }).expect(200);
      // N0: 0 (no probation) and 6 months are the bounds.
      await patch({ employees: { defaultProbationMonths: 0 } }).expect(200);
      await patch({ employees: { defaultProbationMonths: 6 } }).expect(200);
      // N3: check days 1 and 31; contract 1–120 with no second reminder (0); probation 1 and 60.
      await patch({ reminders: { latenessCheckDay: 1, payrollCheckDay: 31 } }).expect(200);
      await patch({ reminders: { contractEndDays: 1, contractEndSecondDays: 0 } }).expect(200);
      await patch({ reminders: { contractEndDays: 120, contractEndSecondDays: 60 } }).expect(200);
      await patch({ reminders: { probationEndDays: 60 } }).expect(200);
      await patch({ reminders: { probationEndDays: 1 } }).expect(200);
    });

    it('N3 edge 15 — the second contract reminder ≥ the first → 400 INVALID_REMINDER_DAYS', async () => {
      const res = await patch({ reminders: { contractEndSecondDays: 30 } }).expect(400);
      expect(res.body).toMatchObject({ success: false, error: 'INVALID_REMINDER_DAYS' });
    });
  });

  it('PATCH /hr/settings writes one history row per changed key (old, new, user)', async () => {
    const res = await patch({
      lateness: { graceMinutes: 10 },
      payroll: { dayDivisor: 26, partTime: { PART_TIME_3: 50 } },
      penalties: { repetitionWindow: 'CONTRACT_YEAR' }, // unchanged → no event
    }).expect(200);

    expect(res.body.data.payroll).toEqual({
      dayDivisor: 26,
      partTime: { PART_TIME_4: 80, PART_TIME_3: 50, PART_TIME_2: 40 },
    });

    // One settings.changed per changed key, after the commit (history is already written).
    const byKey = Object.fromEntries(events.map((e) => [e.key, e]));
    expect(events).toHaveLength(3);
    expect(byKey['hr.lateness.graceMinutes']).toMatchObject({
      scope: 'hr',
      oldValue: 0,
      newValue: 10,
      changedById: user.id,
    });
    expect(byKey['hr.payroll.dayDivisor']).toMatchObject({ oldValue: 30, newValue: 26 });
    expect(byKey['hr.payroll.partTime']).toMatchObject({
      oldValue: { PART_TIME_4: 80, PART_TIME_3: 60, PART_TIME_2: 40 },
      newValue: { PART_TIME_4: 80, PART_TIME_3: 50, PART_TIME_2: 40 },
    });
    for (const e of events) expect(Number.isNaN(Date.parse(e.changedAt))).toBe(false);

    // The rows were committed before the events, with the user recorded.
    const rows = await db.schoolSetting.findMany({ where: { key: { in: HR_KEYS } } });
    expect(rows.map((r) => r.key).sort()).toEqual(Object.keys(byKey).sort());
    for (const r of rows) expect(r.updatedById).toBe(user.id);

    // Exactly ONE history row per changed key, all in one hr.settings.update entry written in
    // the same transaction as the change (audit D2).
    const history = await historyRows(db, mark, HR_KEYS);
    expect(history.map((h) => h.key).sort()).toEqual(Object.keys(byKey).sort());
    for (const h of history) {
      expect(h).toMatchObject({ scope: 'HR', action: 'hr.settings.update', changedById: user.id });
    }
    expect(new Set(history.map((h) => h.entryId)).size).toBe(1);

    // The same PATCH again changes nothing → no events.
    events = [];
    await patch({ lateness: { graceMinutes: 10 }, payroll: { dayDivisor: 26 } }).expect(200);
    expect(events).toHaveLength(0);
    expect(await historyRows(db, mark, HR_KEYS)).toHaveLength(3);
  });

  it('empty PATCH → 200 with the current settings, no changes', async () => {
    const res = await patch({}).expect(200);
    expect(res.body.data.payroll.dayDivisor).toBe(30);
    expect(events).toHaveLength(0);
  });

  it('full flow: change the lateness and payroll rules → GET shows them → lateness days follow the new rule', async () => {
    const before = await getSettings();
    expect(latenessDays(90, before.lateness)).toBe(0.75);

    await patch({
      lateness: {
        graceMinutes: 10,
        steps: [
          { hour: 2, days: 1 },
          { hour: 1, days: 0.5 },
          { hour: 3, days: 1.5 },
        ],
        extraHourDays: 0.25,
      },
      payroll: { dayDivisor: 26, partTime: { PART_TIME_4: 75 } },
      penalties: { repetitionWindow: 'ROLLING_12_MONTHS' },
      employees: { defaultProbationMonths: 0 },
      reminders: {
        contractEndDays: 45,
        contractEndSecondDays: 10,
        probationEndDays: 14,
        latenessCheckDay: 20,
        payrollCheckDay: 31,
      },
    }).expect(200);

    const after = await getSettings();
    expect(after).toEqual({
      lateness: {
        graceMinutes: 10,
        steps: [
          { hour: 1, days: 0.5 },
          { hour: 2, days: 1 },
          { hour: 3, days: 1.5 },
        ],
        extraHourDays: 0.25,
      },
      payroll: { dayDivisor: 26, partTime: { PART_TIME_4: 75, PART_TIME_3: 60, PART_TIME_2: 40 } },
      penalties: { repetitionWindow: 'ROLLING_12_MONTHS' },
      employees: { defaultProbationMonths: 0 },
      reminders: {
        contractEndDays: 45,
        contractEndSecondDays: 10,
        probationEndDays: 14,
        latenessCheckDay: 20,
        payrollCheckDay: 31,
      },
    });
    // 90 min − 10 grace = 80 → 2nd hour → 0.5 + 1.
    expect(latenessDays(90, after.lateness)).toBe(1.5);
    expect(events.map((e) => e.key).sort()).toEqual([...HR_KEYS].sort());
  });
});
