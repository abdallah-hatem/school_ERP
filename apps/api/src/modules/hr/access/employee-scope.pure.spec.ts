import {
  covers,
  employeeWhere,
  headsStage,
  inScope,
  penaltyInScope,
  penaltyWhere,
  toEmployeeScope,
  withoutFields,
  type ScopedEmployee,
  type ScopedPenalty,
} from './employee-scope.pure';

const link = { employeeId: 'me', stageId: 'primary', stageIds: ['primary'] };
const stageWhere = (ids: string[]) => ({
  OR: [{ stageId: { in: ids } }, { otherStages: { some: { stageId: { in: ids } } } }],
});
const emp = (id: string, stageId: string, managerId: string | null): ScopedEmployee => ({
  id,
  stageId,
  managerId,
});
const inMyStage = emp('a', 'primary', 'x');
const otherStage = emp('b', 'kg', 'me');
const me = emp('me', 'primary', 'boss');

describe('employee scopes (R5)', () => {
  it('all → every employee, no filter', () => {
    const scope = toEmployeeScope({ scope: 'all', ...link });
    expect(employeeWhere(scope)).toEqual({});
    expect([inMyStage, otherStage, me].every((e) => inScope(scope, e))).toBe(true);
  });

  it("own_stage → the employees of the linked employee's stage", () => {
    const scope = toEmployeeScope({ scope: 'own_stage', ...link });
    expect(employeeWhere(scope)).toEqual(stageWhere(['primary']));
    expect(inScope(scope, inMyStage)).toBe(true);
    expect(inScope(scope, me)).toBe(true);
    expect(inScope(scope, otherStage)).toBe(false);
  });

  it('own_team → the employees whose direct manager is the linked employee', () => {
    const scope = toEmployeeScope({ scope: 'own_team', ...link });
    expect(employeeWhere(scope)).toEqual({ managerId: 'me' });
    expect(inScope(scope, otherStage)).toBe(true);
    expect(inScope(scope, inMyStage)).toBe(false);
    expect(inScope(scope, me)).toBe(false);
  });

  it('self → only the linked employee', () => {
    const scope = toEmployeeScope({ scope: 'self', ...link });
    expect(employeeWhere(scope)).toEqual({ id: 'me' });
    expect(inScope(scope, me)).toBe(true);
    expect(inScope(scope, inMyStage)).toBe(false);
  });

  it.each(['own_stage', 'own_team', 'self'] as const)(
    'no linked employee and scope %s → nobody (empty lists, never everybody)',
    (scope) => {
      const s = toEmployeeScope({ scope, employeeId: null, stageId: null, stageIds: [] });
      expect(s).toEqual({ kind: 'none' });
      expect(employeeWhere(s)).toEqual({ id: { in: [] } });
      expect(inScope(s, me)).toBe(false);
    },
  );

  it('a key the user does not hold → nobody', () => {
    expect(toEmployeeScope(null)).toEqual({ kind: 'none' });
  });

  it('covers: all covers everything; equal scopes cover each other; a stage never covers "all"', () => {
    const all = toEmployeeScope({ scope: 'all', ...link });
    const stage = toEmployeeScope({ scope: 'own_stage', ...link });
    const team = toEmployeeScope({ scope: 'own_team', ...link });
    expect(covers(all, stage)).toBe(true);
    expect(covers(stage, stage)).toBe(true);
    expect(covers(stage, all)).toBe(false);
    expect(covers(team, stage)).toBe(false);
    expect(covers({ kind: 'none' }, team)).toBe(false);
    expect(covers({ kind: 'none' }, { kind: 'none' })).toBe(true);
  });

  describe('several stages (owner 2026-11-21)', () => {
    const twoStages = toEmployeeScope({
      scope: 'own_stage',
      employeeId: 'me',
      stageId: 'primary',
      stageIds: ['primary', 'prep'],
    });

    it('a head of two stages covers the employees of both, by main or other stage', () => {
      expect(employeeWhere(twoStages)).toEqual(stageWhere(['primary', 'prep']));
      expect(inScope(twoStages, emp('p', 'prep', null))).toBe(true);
      expect(inScope(twoStages, { ...emp('k', 'kg', null), otherStageIds: ['prep'] })).toBe(true);
      expect(inScope(twoStages, { ...emp('k2', 'kg', null), otherStageIds: ['secondary'] })).toBe(false);
    });

    it('an employee is found under each of their stages: the head of their other stage covers them too', () => {
      const prepHead = toEmployeeScope({ scope: 'own_stage', employeeId: 'h', stageId: 'prep', stageIds: ['prep'] });
      expect(inScope(prepHead, { ...emp('t', 'primary', null), otherStageIds: ['prep'] })).toBe(true);
    });

    it('covers: a stage set covers a subset of itself, never a wider one', () => {
      const one = toEmployeeScope({ scope: 'own_stage', ...link });
      expect(covers(twoStages, one)).toBe(true);
      expect(covers(one, twoStages)).toBe(false);
    });
  });

  describe("penalty scopes go by the penalty's stage, not the employee's (owner 2026-11-21)", () => {
    const pen = (stageId: string, employeeId = 't', managerId: string | null = null): ScopedPenalty => ({
      stageId,
      employeeId,
      employee: { managerId },
    });
    const primaryHead = toEmployeeScope({ scope: 'own_stage', ...link });
    const prepHead = toEmployeeScope({ scope: 'own_stage', employeeId: 'h', stageId: 'prep', stageIds: ['prep'] });
    const both = toEmployeeScope({
      scope: 'own_stage',
      employeeId: 'b',
      stageId: 'primary',
      stageIds: ['primary', 'prep'],
    });

    it('multi-stage visibility: the other stage head cannot see a penalty from a stage that is not theirs', () => {
      // A teacher of primary and prep, penalised in primary: only primary's head covers it.
      expect(penaltyInScope(primaryHead, pen('primary'))).toBe(true);
      expect(penaltyInScope(prepHead, pen('primary'))).toBe(false);
      expect(penaltyWhere(prepHead)).toEqual({ stageId: { in: ['prep'] } });
    });

    it('a stage head of two stages covers the penalties of both', () => {
      expect(penaltyInScope(both, pen('primary'))).toBe(true);
      expect(penaltyInScope(both, pen('prep'))).toBe(true);
      expect(penaltyInScope(both, pen('kg'))).toBe(false);
      expect(penaltyWhere(both)).toEqual({ stageId: { in: ['primary', 'prep'] } });
    });

    it('all, team, self and none keep their meaning', () => {
      expect(penaltyWhere({ kind: 'all' })).toEqual({});
      expect(penaltyWhere({ kind: 'team', managerId: 'me' })).toEqual({ employee: { managerId: 'me' } });
      expect(penaltyInScope({ kind: 'team', managerId: 'me' }, pen('kg', 'x', 'me'))).toBe(true);
      expect(penaltyWhere({ kind: 'self', employeeId: 'me' })).toEqual({ employeeId: 'me' });
      expect(penaltyInScope({ kind: 'none' }, pen('primary'))).toBe(false);
      expect(penaltyWhere({ kind: 'none' })).toEqual({ id: { in: [] } });
    });

    it('headsStage: only an own_stage grant over that stage; the school-wide System admin heads none', () => {
      expect(headsStage(both, 'prep')).toBe(true);
      expect(headsStage(primaryHead, 'prep')).toBe(false);
      expect(headsStage({ kind: 'all' }, 'prep')).toBe(false);
    });
  });

  it('withoutFields leaves the fields out (absent, not null) unless visible', () => {
    const row = { id: 'e', basicSalary: 1, iban: null as string | null };
    expect(withoutFields(row, ['basicSalary', 'iban'], true)).toEqual(row);
    const hidden = withoutFields(row, ['basicSalary', 'iban'], false);
    expect(hidden).toEqual({ id: 'e' });
    expect('basicSalary' in hidden).toBe(false);
    expect('iban' in hidden).toBe(false);
  });
});
