import { WORK_TIME } from '../settings';
import type { TimeOfDay } from '../types/common';

/** `HH:mm`, 24-hour, zero-padded — the stored format (two times then compare as text). */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function fromMinutes(minutes: number): TimeOfDay {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** §7: a valid `HH:mm` on a 30-minute boundary (07:30 yes, 07:15 no). */
export function isOnWorkTimeStep(time: string): boolean {
  return TIME_OF_DAY_PATTERN.test(time) && toMinutes(time) % WORK_TIME.stepMinutes === 0;
}

/**
 * The work start / end choices: `WORK_TIME.earliest` … `WORK_TIME.latest` in 30-minute steps.
 * A stored value outside that range is added in order, so the current value is always shown.
 */
export function workTimeOptions(current?: string): TimeOfDay[] {
  const options: TimeOfDay[] = [];
  const last = toMinutes(WORK_TIME.latest);
  for (let m = toMinutes(WORK_TIME.earliest); m <= last; m += WORK_TIME.stepMinutes) {
    options.push(fromMinutes(m));
  }
  if (current && TIME_OF_DAY_PATTERN.test(current) && !options.includes(current)) {
    options.push(current);
    options.sort();
  }
  return options;
}
