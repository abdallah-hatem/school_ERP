import { oncePerDayRefuses } from '.';

describe('oncePerDayRefuses (§4 DECIDED, owner 2026-11-18)', () => {
  describe('recording', () => {
    it('refuses a second same-day penalty while the first is pending or approved', () => {
      expect(oncePerDayRefuses(true, ['WAITING_HR'], 'record')).toBe(true);
      expect(oncePerDayRefuses(true, ['APPROVED'], 'record')).toBe(true);
    });
    it('a cancelled one on that day does not block', () => {
      expect(oncePerDayRefuses(true, ['CANCELLED'], 'record')).toBe(false);
      expect(oncePerDayRefuses(true, ['CANCELLED', 'CANCELLED'], 'record')).toBe(false);
      expect(oncePerDayRefuses(true, ['CANCELLED', 'PENDING_REVIEW'], 'record')).toBe(true);
    });
    it('two steps (owner 2026-11-21): waiting at either step blocks the day; a rejected one frees it', () => {
      expect(oncePerDayRefuses(true, ['PENDING_REVIEW'], 'record')).toBe(true);
      expect(oncePerDayRefuses(true, ['WAITING_HR'], 'record')).toBe(true);
      expect(oncePerDayRefuses(true, ['REJECTED'], 'record')).toBe(false);
      expect(oncePerDayRefuses(true, ['REJECTED'], 'approve')).toBe(false);
    });
    it('the first one of the day is allowed', () => {
      expect(oncePerDayRefuses(true, [], 'record')).toBe(false);
    });
    it('a violation that repeats within a day (flag off) is never refused', () => {
      expect(oncePerDayRefuses(false, ['APPROVED', 'WAITING_HR'], 'record')).toBe(false);
    });
  });

  describe('approving (re-checked)', () => {
    it('refused when another one that day is already approved', () => {
      expect(oncePerDayRefuses(true, ['APPROVED'], 'approve')).toBe(true);
    });
    it('another pending one does not block — the first approved wins', () => {
      expect(oncePerDayRefuses(true, ['WAITING_HR'], 'approve')).toBe(false);
      expect(oncePerDayRefuses(true, ['CANCELLED'], 'approve')).toBe(false);
    });
    it('flag off: never refused', () => {
      expect(oncePerDayRefuses(false, ['APPROVED'], 'approve')).toBe(false);
    });
  });
});
