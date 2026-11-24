import { describe, expect, it } from 'vitest';
import { contract, TODAY } from '../test/fixtures';
import { abilitiesOf, decisionTags, nextAction, refusedRows } from './contract-text';
import { contractsQueryString, parseContractsQuery } from './list-query';

const HR = { manage: true, changeStatus: true, today: TODAY };

describe('a contract row: what it allows (view only — the API decides)', () => {
  it('an open contract can be renewed and decided; nobody acts on their own', () => {
    const open = abilitiesOf(contract(), HR);
    expect(open).toMatchObject({ renew: true, decide: true, end: true, approveOrReject: false, own: false });
    expect(nextAction(contract(), open)).toBe('renew');
    const own = abilitiesOf(contract({ ownContract: true }), HR);
    expect(own).toMatchObject({ renew: false, decide: false, end: false, own: true });
    expect(nextAction(contract({ ownContract: true }), own)).toBeNull();
  });

  it('bug 2026-11-24 — an upcoming contract (a renewal’s next one) allows nothing; from its first day it is renewable', () => {
    const next = contract({ id: 'c-2', year: 2027, startsOn: '2027-06-01', endsOn: '2028-05-31', phase: 'UPCOMING' });
    expect(abilitiesOf({ ...next, renewalOf: 'c-1' }, HR)).toMatchObject({ renew: false, decide: false, end: false, cancel: false, deactivate: false });
    // Not a renewal (a future new contract): only cancelled.
    expect(abilitiesOf(next, HR)).toMatchObject({ renew: false, decide: false, end: false, cancel: true });
    expect(abilitiesOf(next, { ...HR, manage: false }).cancel).toBe(false);
    expect(nextAction(next, abilitiesOf(next, HR))).toBeNull();
    const started = { ...next, phase: 'CURRENT' as const };
    expect(abilitiesOf(started, { ...HR, today: '2027-06-01' })).toMatchObject({ renew: true, decide: true });
    // The shared rule reads the school's today too: the day before its start it refuses.
    expect(abilitiesOf(started, { ...HR, today: '2027-05-31' })).toMatchObject({ renew: false, decide: false });
  });

  it('an inactive employee is not renewable (shared renewalRefusal); without manage nothing is', () => {
    const inactive = contract({ employee: { ...contract().employee, status: 'INACTIVE' } });
    expect(abilitiesOf(inactive, HR).renew).toBe(false);
    expect(abilitiesOf(contract(), { ...HR, manage: false })).toMatchObject({ renew: false, decide: false, end: false });
  });

  it('a waiting early termination is approved or rejected first; a passed notice cannot be withdrawn', () => {
    const early = contract({
      decision: 'EARLY_REQUESTED',
      earlyTermination: {
        status: 'REQUESTED',
        requestedOn: '2026-11-12',
        timing: 'CALENDAR_NOT_SET',
        note: null,
        fileUrl: null,
        wouldEndOn: null,
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
      },
    });
    const can = abilitiesOf(early, HR);
    expect(can).toMatchObject({ renew: false, decide: false, end: false, approveOrReject: true });
    expect(nextAction(early, can)).toBe('decideEarly');
    expect(decisionTags(early)).toEqual(['CALENDAR_NOT_SET']);

    const notice = contract({ status: 'NOT_RENEWED', decision: 'NOTICE', nonRenewalBy: 'EMPLOYEE', endsOn: '2026-08-31' });
    expect(abilitiesOf(notice, HR).withdrawNotice).toBe(false);
    expect(abilitiesOf({ ...notice, endsOn: '2027-05-31' }, HR).withdrawNotice).toBe(true);
  });

  it('an ended, not renewed contract whose employee is still active: Deactivate (needs change_status)', () => {
    const ended = contract({ status: 'NOT_RENEWED', decision: 'NOT_RENEWED_SCHOOL', toDeactivate: true });
    expect(nextAction(ended, abilitiesOf(ended, HR))).toBe('deactivate');
    expect(nextAction(ended, abilitiesOf(ended, { ...HR, changeStatus: false }))).toBeNull();
    expect(decisionTags(ended)).toEqual(['toDeactivate']);
  });

  it("a refused bulk renewal's rows, as a list or under `refused`; other errors have none", () => {
    const rows = [{ contractId: 'c-2', code: 'EMPLOYEE_INACTIVE' }];
    expect(refusedRows({ error: 'CONTRACTS_NOT_RENEWABLE', data: rows })).toEqual(rows);
    expect(refusedRows({ error: 'CONTRACTS_NOT_RENEWABLE', data: { refused: rows } })).toEqual(rows);
    expect(refusedRows({ error: 'OWN_CONTRACT', data: rows })).toEqual([]);
  });
});

describe('the renewal list in the URL', () => {
  it('reads year, decision, stage, search and paging; drops what is unknown', () => {
    expect(
      parseContractsQuery({ year: '2027', decision: 'OPEN', stageId: 'nope', search: ' heba ', page: '2', limit: '500' }, 2026),
    ).toEqual({ year: 2027, decision: 'OPEN', stageId: undefined, search: 'heba', page: 2, limit: 100 });
    expect(parseContractsQuery({ year: 'x', decision: 'MAYBE' }, 2026)).toMatchObject({ year: 2026, decision: undefined, page: 1 });
  });

  it('leaves the defaults out', () => {
    expect(contractsQueryString({ year: 2026, page: 1, limit: 10 }, 2026)).toBe('');
    expect(contractsQueryString({ year: 2025, decision: 'TO_DEACTIVATE', page: 2, limit: 10 }, 2026)).toBe(
      '?year=2025&decision=TO_DEACTIVATE&page=2',
    );
  });
});
