/*
 * Egyptian mobile numbers: 11 digits, `01` then one of the operator digits 0, 1, 2 or 5.
 * The field keeps the number as a string (never `Number()` — the leading zero matters).
 */

/** A complete Egyptian mobile number. */
export const EGYPTIAN_MOBILE = /^01[0125]\d{8}$/;

/** Text that can still grow into a valid number: `''`, `0`, `01`, `010`, … up to 11 digits. */
const PARTIAL_MOBILE = /^(0(1([0125]\d{0,8})?)?)?$/;

/**
 * Normalises typed or pasted text to local digits — `+20 10 1234 5678`, `0020…` and `20…` become
 * `010…`; spaces, dashes and brackets are dropped. Returns `null` when the text can never become a
 * valid number (a letter, a 12th digit, an impossible prefix), so the field rejects the change
 * instead of trimming it.
 */
export function normalizeEgyptianMobile(text: string): string | null {
  let digits = text.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d*$/.test(digits)) return null;
  if (digits.startsWith('0020')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('201') && digits.length > 3) digits = `0${digits.slice(2)}`;
  return PARTIAL_MOBILE.test(digits) ? digits : null;
}
