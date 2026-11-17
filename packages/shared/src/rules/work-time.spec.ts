import { describe, expect, it } from 'vitest';
import { isOnWorkTimeStep, workTimeOptions } from './work-time';

describe('isOnWorkTimeStep', () => {
  it('accepts :00 and :30, refuses other minutes and malformed times', () => {
    expect(isOnWorkTimeStep('07:30')).toBe(true);
    expect(isOnWorkTimeStep('15:00')).toBe(true);
    expect(isOnWorkTimeStep('00:00')).toBe(true);
    expect(isOnWorkTimeStep('07:15')).toBe(false);
    expect(isOnWorkTimeStep('07:31')).toBe(false);
    expect(isOnWorkTimeStep('7:30')).toBe(false);
    expect(isOnWorkTimeStep('24:00')).toBe(false);
  });
});

describe('workTimeOptions', () => {
  it('05:00 … 20:00 in 30-minute steps', () => {
    const options = workTimeOptions();
    expect(options[0]).toBe('05:00');
    expect(options[1]).toBe('05:30');
    expect(options.at(-1)).toBe('20:00');
    expect(options).toHaveLength(31);
  });

  it('a stored value outside the range is kept, in order', () => {
    const options = workTimeOptions('04:30');
    expect(options[0]).toBe('04:30');
    expect(options).toHaveLength(32);
    expect(workTimeOptions('07:30')).toHaveLength(31);
  });
});
