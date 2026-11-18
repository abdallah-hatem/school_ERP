import {
  covers,
  employeeWhere,
  inScope,
  toEmployeeScope,
  withoutFields,
  type ScopedEmployee,
} from './employee-scope.pure';

const link = { employeeId: 'me', stageId: 'primary' };
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
    expect(employeeWhere(scope)).toEqual({ stageId: 'primary' });
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
      const s = toEmployeeScope({ scope, employeeId: null, stageId: null });
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

  it('withoutFields leaves the fields out (absent, not null) unless visible', () => {
    const row = { id: 'e', basicSalary: 1, iban: null as string | null };
    expect(withoutFields(row, ['basicSalary', 'iban'], true)).toEqual(row);
    const hidden = withoutFields(row, ['basicSalary', 'iban'], false);
    expect(hidden).toEqual({ id: 'e' });
    expect('basicSalary' in hidden).toBe(false);
    expect('iban' in hidden).toBe(false);
  });
});
