import { SETTINGS_HISTORY_ACTION_KEYS } from '@school-erp/shared';
import { describe, expect, it } from 'vitest';
import { activeFilterCount, activityQueryString, parseActivityQuery, toAuditListQuery } from './query';

const PERSON = '11111111-1111-4111-8111-111111111111';

describe('Activity query (URL ↔ API)', () => {
  it('reads the URL, dropping unknown values; writes it back without defaults', () => {
    const query = parseActivityQuery({
      page: '2',
      q: ' Omar ',
      module: 'hr',
      type: 'update,nope,create',
      person: PERSON,
      from: '2026-11-17',
      to: '2026-11-01',
    });
    // A reversed range is swapped; chips keep their fixed order.
    expect(query).toEqual({
      page: 2,
      q: 'Omar',
      module: 'hr',
      types: ['create', 'update'],
      actorId: PERSON,
      from: '2026-11-01',
      to: '2026-11-17',
    });
    expect(activityQueryString(query)).toBe(
      `?q=Omar&module=hr&type=create%2Cupdate&person=${PERSON}&from=2026-11-01&to=2026-11-17&page=2`,
    );
    expect(activeFilterCount(query)).toBe(5);
    expect(parseActivityQuery({ module: 'fees', person: 'abc', from: '2026-02-30', page: '-1' })).toEqual({ page: 1, types: [] });
    expect(activityQueryString({ page: 1, types: [] })).toBe('');
  });

  it('maps to the API: module, the chips’ actions, the school-day range (to exclusive), 10 per page', () => {
    expect(toAuditListQuery(parseActivityQuery({ module: 'core', from: '2026-11-17', to: '2026-11-17' }))).toEqual({
      page: 1,
      limit: 10,
      module: 'core',
      from: '2026-11-16T22:00:00.000Z',
      to: '2026-11-17T22:00:00.000Z',
    });
    const chips = toAuditListQuery(parseActivityQuery({ type: 'signIn,failed', module: 'core' }));
    expect(chips?.action).toEqual(['core.auth.sign_in', 'core.auth.sign_out', 'core.auth.sign_in_failed']);
    // HR + sign-ins can't match anything.
    expect(toAuditListQuery(parseActivityQuery({ type: 'signIn', module: 'hr' }))).toBeNull();
  });

  it('"Settings" is the settings actions of both modules, narrowed further by the chips', () => {
    expect(toAuditListQuery(parseActivityQuery({ module: 'settings' }))?.action).toEqual(SETTINGS_HISTORY_ACTION_KEYS);
    const created = toAuditListQuery(parseActivityQuery({ module: 'settings', type: 'create' }));
    expect(created?.action).toEqual(SETTINGS_HISTORY_ACTION_KEYS.filter((a) => a.endsWith('.create')));
    expect(created).not.toHaveProperty('module');
    expect(toAuditListQuery(parseActivityQuery({ module: 'settings', type: 'failed' }))).toBeNull();
  });
});
