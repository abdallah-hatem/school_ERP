import { PENALTY_STATUSES, type PenaltyStatus } from '@school-erp/shared';
import {
  actsOnOwnPenalty,
  countPriorInWindow,
  decisionFrom,
  earlierPendingPenalty,
  firstStep,
  migratedPenaltyStatus,
  oncePerDayRefuses,
  optionalNote,
  penaltyLevel,
  penaltyStage,
  penaltyTransition,
  recountAfterApproval,
  rejectionReason,
  rejectionStep,
  type CatalogueLevel,
  type PenaltyDecision,
  type RecordedPenalty,
} from '.';

/*
 * §4 two steps (owner 2026-11-21): "record penalty => approve or reject (reasons) => hr approval
 * or reject (reasons)". Each case is named after the edge case it covers.
 */

const DECISIONS: PenaltyDecision[] = ['REVIEW_APPROVE', 'REVIEW_REJECT', 'HR_APPROVE', 'HR_REJECT', 'CANCEL'];

/** Every allowed (status, decision) → status; anything not listed is refused. */
const ALLOWED: Record<string, PenaltyStatus> = {
  'PENDING_REVIEW:REVIEW_APPROVE': 'WAITING_HR',
  'PENDING_REVIEW:REVIEW_REJECT': 'REJECTED',
  'PENDING_REVIEW:CANCEL': 'CANCELLED',
  'WAITING_HR:HR_APPROVE': 'APPROVED',
  'WAITING_HR:HR_REJECT': 'REJECTED',
  'WAITING_HR:CANCEL': 'CANCELLED',
  'APPROVED:CANCEL': 'CANCELLED',
};

describe('penaltyTransition — the two steps (§4, owner 2026-11-21)', () => {
  it.each(Object.entries(ALLOWED))('allowed: %s → %s', (pair, to) => {
    const [status, decision] = pair.split(':') as [PenaltyStatus, PenaltyDecision];
    expect(penaltyTransition(status, decision)).toEqual({ ok: true, to });
  });

  const forbidden = PENALTY_STATUSES.flatMap((status) =>
    DECISIONS.filter((d) => !ALLOWED[`${status}:${d}`]).map((d) => [status, d] as const),
  );

  it.each(forbidden)('forbidden: %s + %s is refused', (status, decision) => {
    const result = penaltyTransition(status, decision);
    expect(result.ok).toBe(false);
  });

  it('every forbidden pair says why: cancelled and rejected are final, anything else is the wrong step', () => {
    for (const [status, decision] of forbidden) {
      const result = penaltyTransition(status, decision);
      const expected =
        status === 'CANCELLED'
          ? 'PENALTY_CANCELLED'
          : status === 'REJECTED'
            ? 'PENALTY_REJECTED'
            : 'PENALTY_WRONG_STEP';
      expect({ status, decision, result }).toEqual({ status, decision, result: { ok: false, refusal: expected } });
    }
  });

  it('only HR approval reaches APPROVED: the stage review only moves it to WAITING_HR', () => {
    expect(penaltyTransition('PENDING_REVIEW', 'REVIEW_APPROVE')).toEqual({ ok: true, to: 'WAITING_HR' });
    expect(penaltyTransition('PENDING_REVIEW', 'HR_APPROVE')).toEqual({ ok: false, refusal: 'PENALTY_WRONG_STEP' });
    expect(penaltyTransition('WAITING_HR', 'REVIEW_APPROVE')).toEqual({ ok: false, refusal: 'PENALTY_WRONG_STEP' });
  });

  it('cancel: allowed while pending stage review, waiting for HR or approved; refused once cancelled or rejected', () => {
    expect(penaltyTransition('PENDING_REVIEW', 'CANCEL')).toEqual({ ok: true, to: 'CANCELLED' });
    expect(penaltyTransition('WAITING_HR', 'CANCEL')).toEqual({ ok: true, to: 'CANCELLED' });
    expect(penaltyTransition('APPROVED', 'CANCEL')).toEqual({ ok: true, to: 'CANCELLED' });
    expect(penaltyTransition('CANCELLED', 'CANCEL')).toEqual({ ok: false, refusal: 'PENALTY_CANCELLED' });
    expect(penaltyTransition('REJECTED', 'CANCEL')).toEqual({ ok: false, refusal: 'PENALTY_REJECTED' });
  });

  it('actions on an approved penalty other than cancel are refused (wrong step)', () => {
    for (const d of ['REVIEW_APPROVE', 'REVIEW_REJECT', 'HR_APPROVE', 'HR_REJECT'] as const) {
      expect(penaltyTransition('APPROVED', d)).toEqual({ ok: false, refusal: 'PENALTY_WRONG_STEP' });
    }
  });

  describe('stage head removed while pending stage review (edge case 3): HR may decide directly', () => {
    it('with no stage head left, HR approves or rejects a PENDING_REVIEW penalty', () => {
      expect(penaltyTransition('PENDING_REVIEW', 'HR_APPROVE', { hrMayDecide: true })).toEqual({ ok: true, to: 'APPROVED' });
      expect(penaltyTransition('PENDING_REVIEW', 'HR_REJECT', { hrMayDecide: true })).toEqual({ ok: true, to: 'REJECTED' });
      expect(decisionFrom('HR_APPROVE', { hrMayDecide: true }).sort()).toEqual(['PENDING_REVIEW', 'WAITING_HR']);
    });
    it('while a stage head is there, HR waits for the review', () => {
      expect(penaltyTransition('PENDING_REVIEW', 'HR_APPROVE', { hrMayDecide: false }).ok).toBe(false);
      expect(decisionFrom('HR_APPROVE')).toEqual(['WAITING_HR']);
    });
    it('it never lets the review step act on anything else, nor HR on a final penalty', () => {
      expect(penaltyTransition('REJECTED', 'HR_APPROVE', { hrMayDecide: true }).ok).toBe(false);
      expect(penaltyTransition('CANCELLED', 'HR_REJECT', { hrMayDecide: true }).ok).toBe(false);
      expect(penaltyTransition('WAITING_HR', 'REVIEW_APPROVE', { hrMayDecide: true }).ok).toBe(false);
    });
  });

  it('a rejection records its step: the stage review, or HR', () => {
    expect(rejectionStep('REVIEW_REJECT')).toBe('REVIEW');
    expect(rejectionStep('HR_REJECT')).toBe('HR');
  });
});

describe('a reason is required to reject (edge case 7)', () => {
  it('empty or whitespace-only reasons are refused', () => {
    expect(rejectionReason('')).toBeNull();
    expect(rejectionReason('   \n\t ')).toBeNull();
    expect(rejectionReason(undefined)).toBeNull();
    expect(rejectionReason(42)).toBeNull();
  });
  it('a reason is trimmed; at most 1,000 characters', () => {
    expect(rejectionReason('  Not his class  ')).toBe('Not his class');
    expect(rejectionReason('x'.repeat(1000))).toHaveLength(1000);
    expect(rejectionReason('x'.repeat(1001))).toBeNull();
  });
  it('Arabic text is fine', () => {
    expect(rejectionReason(' كان في مهمة رسمية ')).toBe('كان في مهمة رسمية');
  });
  it('an approval note is optional: blank → none', () => {
    expect(optionalNote('  ')).toBeNull();
    expect(optionalNote(undefined)).toBeNull();
    expect(optionalNote(' ok ')).toBe('ok');
  });
});

describe('where a new penalty starts (firstStep, owner 2026-11-21 defaults)', () => {
  const facts = { employeeIsHead: false, recorderMayReview: false, stageHasHead: true };

  it('normally: Pending stage review', () => {
    expect(firstStep(facts)).toEqual({ status: 'PENDING_REVIEW', skip: null });
  });
  it('the recorder is a stage head of the penalty stage → skip: their recording is the review', () => {
    expect(firstStep({ ...facts, recorderMayReview: true })).toEqual({ status: 'WAITING_HR', skip: 'RECORDER_IS_HEAD' });
  });
  it('no stage head → skip straight to Waiting for HR', () => {
    expect(firstStep({ ...facts, stageHasHead: false })).toEqual({ status: 'WAITING_HR', skip: 'NO_STAGE_HEAD' });
  });
  it('penalty against a stage head (edge case 1): they cannot review their own → Waiting for HR', () => {
    expect(firstStep({ ...facts, employeeIsHead: true })).toEqual({ status: 'WAITING_HR', skip: 'EMPLOYEE_IS_HEAD' });
  });
  it('penalty against a stage head recorded by themselves (edge case 1) → Waiting for HR, never their own review', () => {
    // As the recorder they could review the stage — but the penalty is theirs: EMPLOYEE_IS_HEAD wins.
    expect(firstStep({ employeeIsHead: true, recorderMayReview: true, stageHasHead: false })).toEqual({
      status: 'WAITING_HR',
      skip: 'EMPLOYEE_IS_HEAD',
    });
  });
});

describe('nobody acts on their own penalty (edge cases 1 and 2)', () => {
  it('the stage head or HR approver who is the penalised employee is refused', () => {
    expect(actsOnOwnPenalty('emp-1', 'emp-1')).toBe(true);
  });
  it('anyone else, or a user with no employee record, is not', () => {
    expect(actsOnOwnPenalty('emp-2', 'emp-1')).toBe(false);
    expect(actsOnOwnPenalty(null, 'emp-1')).toBe(false);
  });
});

describe('the stage the penalty is recorded in (penaltyStage)', () => {
  it('one stage fills in by itself', () => {
    expect(penaltyStage(['primary'], undefined)).toEqual({ ok: true, stageId: 'primary' });
  });
  it('several stages: the recorder must choose, from the employee stages only', () => {
    expect(penaltyStage(['primary', 'prep'], undefined)).toEqual({ ok: false, refusal: 'PENALTY_STAGE_REQUIRED' });
    expect(penaltyStage(['primary', 'prep'], 'prep')).toEqual({ ok: true, stageId: 'prep' });
    expect(penaltyStage(['primary', 'prep'], 'kg')).toEqual({ ok: false, refusal: 'PENALTY_STAGE_INVALID' });
  });
  it('one stage: another one given is refused', () => {
    expect(penaltyStage(['primary'], 'kg')).toEqual({ ok: false, refusal: 'PENALTY_STAGE_INVALID' });
  });
});

// ── Levels and the HR step's rules, with the new statuses ──────────────────────────────

const levels5: CatalogueLevel[] = [
  { level: 1, action: { id: 'act-NOTICE', nameEn: 'NOTICE', nameAr: 'NOTICE', effect: 'RECORD_ONLY', percentBase: null }, days: null, percent: null, amount: null },
  { level: 2, action: { id: 'act-WARNING', nameEn: 'WARNING', nameAr: 'WARNING', effect: 'RECORD_ONLY', percentBase: null }, days: null, percent: null, amount: null },
  { level: 3, action: { id: 'act-DEDUCT_DAYS', nameEn: 'DEDUCT_DAYS', nameAr: 'DEDUCT_DAYS', effect: 'DEDUCT_DAYS', percentBase: null }, days: 1, percent: null, amount: null },
  { level: 4, action: { id: 'act-DEDUCT_DAYS', nameEn: 'DEDUCT_DAYS', nameAr: 'DEDUCT_DAYS', effect: 'DEDUCT_DAYS', percentBase: null }, days: 2, percent: null, amount: null },
  { level: 5, action: { id: 'act-DEDUCT_DAYS', nameEn: 'DEDUCT_DAYS', nameAr: 'DEDUCT_DAYS', effect: 'DEDUCT_DAYS', percentBase: null }, days: 5, percent: null, amount: null },
];
const PAIR = { employeeId: 'teacher', violationId: 'late' };
const rec = (id: string, date: string, status: PenaltyStatus, time = '08:00'): RecordedPenalty => ({
  ...PAIR,
  id,
  date,
  recordedAt: new Date(`${date}T${time}:00Z`),
  status,
});
const w = 'CONTRACT_YEAR' as const;

describe('levels (owner 2026-11-21)', () => {
  it('levels across stages: the same person and violation count together, whatever stage each was in', () => {
    // The repeat count has no stage: a primary penalty and a prep one of the same teacher are 1 and 2.
    const primary = rec('primary-10', '2026-11-10', 'APPROVED');
    const prep = rec('prep-12', '2026-11-12', 'WAITING_HR');
    expect(penaltyLevel(countPriorInWindow(prep, w, [primary, prep]), levels5)).toBe(2);
  });
  it('a rejected penalty never counts toward levels (edge case 10)', () => {
    const rejected = rec('r', '2026-11-10', 'REJECTED');
    const target = rec('t', '2026-11-12', 'WAITING_HR');
    expect(countPriorInWindow(target, w, [rejected])).toBe(0);
  });
  it('a penalty waiting at either step never counts toward levels', () => {
    const target = rec('t', '2026-11-12', 'WAITING_HR');
    expect(countPriorInWindow(target, w, [rec('a', '2026-11-10', 'PENDING_REVIEW'), rec('b', '2026-11-11', 'WAITING_HR')])).toBe(0);
  });
});

describe('the HR step keeps the existing rules (owner 2026-11-21)', () => {
  it('date order (edge case 9): an earlier penalty still in Pending stage review blocks the HR approval of a later one, naming the earliest', () => {
    const d05 = rec('d05', '2026-11-05', 'PENDING_REVIEW');
    const d08 = rec('d08', '2026-11-08', 'WAITING_HR');
    const d20 = rec('d20', '2026-11-20', 'WAITING_HR');
    expect(earlierPendingPenalty(d20, w, [d05, d08, d20])?.id).toBe('d05');
  });
  it('date order: a rejected earlier one does not block', () => {
    const d20 = rec('d20', '2026-11-20', 'WAITING_HR');
    expect(earlierPendingPenalty(d20, w, [rec('d05', '2026-11-05', 'REJECTED'), d20])).toBeNull();
  });
  it('backdated recount at the HR step: approving an earlier one moves the later approved ones; waiting and rejected ones stay', () => {
    const fixed = (id: string, date: string, level: number, status: PenaltyStatus = 'APPROVED') => ({
      ...rec(id, date, status),
      ...levels5[level - 1],
    });
    const changes = recountAfterApproval(
      rec('d18', '2026-11-18', 'WAITING_HR'),
      w,
      [fixed('d19', '2026-11-19', 1), fixed('r20', '2026-11-20', 2, 'REJECTED'), fixed('p21', '2026-11-21', 2, 'PENDING_REVIEW'), fixed('d22', '2026-11-22', 2)],
      levels5,
    );
    expect(changes.map((c) => `${c.record.id}:${c.before.level}→${c.after.level}`)).toEqual(['d19:1→2', 'd22:2→3']);
  });
  it('once per day at the HR step: another approved one that day refuses it', () => {
    expect(oncePerDayRefuses(true, ['APPROVED'], 'approve')).toBe(true);
    expect(oncePerDayRefuses(true, ['PENDING_REVIEW'], 'approve')).toBe(false);
  });
});

describe('the migration of existing Pending (edge case 14)', () => {
  it('existing Pending penalties become Waiting for HR — nothing already pending needs a new review', () => {
    expect(migratedPenaltyStatus('PENDING')).toBe('WAITING_HR');
  });
  it('existing Approved and Cancelled penalties are untouched', () => {
    expect(migratedPenaltyStatus('APPROVED')).toBe('APPROVED');
    expect(migratedPenaltyStatus('CANCELLED')).toBe('CANCELLED');
  });
  it('a migrated penalty is approvable at the HR step at once', () => {
    expect(penaltyTransition(migratedPenaltyStatus('PENDING'), 'HR_APPROVE')).toEqual({ ok: true, to: 'APPROVED' });
  });
});
