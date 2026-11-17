import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  HrSettingKey,
  latenessDays,
  SettingsEvent,
  type AuthUser,
  type HrSettings,
  type SettingsChangedEvent,
} from '@school-erp/shared';
import { DatabaseService } from '../src/database/database.service';
import { http } from './helpers';
import { createAppAsTestUser } from './helpers/as-test-user';

const HR_KEYS = Object.values(HrSettingKey);

describe('HR rule settings — /hr/settings (e2e)', () => {
  let app: INestApplication;
  let user: AuthUser;
  let db: DatabaseService;
  let events: SettingsChangedEvent[];

  const patch = (body: unknown) =>
    http(app)
      .patch('/hr/settings')
      .send(body as object);
  const getSettings = async (): Promise<HrSettings> =>
    (await http(app).get('/hr/settings').expect(200)).body.data as HrSettings;

  beforeAll(async () => {
    ({ app, user } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    app.get(EventEmitter2).on(SettingsEvent.CHANGED, (e: SettingsChangedEvent) => events.push(e));
  });

  beforeEach(async () => {
    await db.schoolSetting.deleteMany({ where: { key: { in: HR_KEYS } } });
    await db.settingChange.deleteMany({ where: { key: { in: HR_KEYS } } });
    events = [];
  });

  afterAll(async () => {
    await db.schoolSetting.deleteMany({ where: { key: { in: HR_KEYS } } });
    await app.close();
  });

  it('Fresh database: HR settings = grace 0, steps 1→0.25 and 2→0.5, extra 0.5, divisor 30, 80/60/40, CONTRACT_YEAR', async () => {
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

    // One settings.changed per changed key; core's listener (T4) turns each into a history row.
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

    // Exactly ONE history row per changed key (core writes history only from the event).
    const history = await db.settingChange.findMany({ where: { key: { in: HR_KEYS } } });
    expect(history.map((h) => h.key).sort()).toEqual(Object.keys(byKey).sort());
    for (const h of history) expect(h).toMatchObject({ scope: 'HR', changedById: user.id });

    // The same PATCH again changes nothing → no events.
    events = [];
    await patch({ lateness: { graceMinutes: 10 }, payroll: { dayDivisor: 26 } }).expect(200);
    expect(events).toHaveLength(0);
    expect(await db.settingChange.count({ where: { key: { in: HR_KEYS } } })).toBe(3);
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
    });
    // 90 min − 10 grace = 80 → 2nd hour → 0.5 + 1.
    expect(latenessDays(90, after.lateness)).toBe(1.5);
    expect(events.map((e) => e.key).sort()).toEqual([...HR_KEYS].sort());
  });
});
