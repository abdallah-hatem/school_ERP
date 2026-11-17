import { PASSWORD_MIN_LENGTH } from '@school-erp/shared';

/*
 * The rules a new password is checked against before it is sent (the API checks them again, and
 * also that it differs from the one in use — `SAME_PASSWORD`). Pure, for the forced "Set a new
 * password" page and My account alike.
 */

export interface NewPassword {
  next: string;
  confirm: string;
}

export interface PasswordCheck {
  longEnough: boolean;
  matches: boolean;
  /** Ready to send. */
  ok: boolean;
}

export function checkNewPassword({ next, confirm }: NewPassword): PasswordCheck {
  const longEnough = next.length >= PASSWORD_MIN_LENGTH;
  const matches = next.length > 0 && next === confirm;
  return { longEnough, matches, ok: longEnough && matches };
}

/**
 * 0–4 bars for the strength meter: one for reaching the minimum, one more for each of length ≥ 14,
 * mixing letters and digits, and a symbol or mixed case. A hint for the person, not a rule.
 */
export function passwordStrength(password: string): number {
  if (password.length < PASSWORD_MIN_LENGTH) return password.length === 0 ? 0 : 1;
  let score = 1;
  if (password.length >= 14) score += 1;
  if (/[a-z؀-ۿ]/i.test(password) && /\d/.test(password)) score += 1;
  if (/[^a-z0-9؀-ۿ\s]/i.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) score += 1;
  return Math.min(score, 4);
}
