/*
 * Phone numbers, kept lenient on purpose (§3 says only "phone required"; the API takes any string):
 * mobiles, landlines and international numbers all pass. 7–20 characters of digits, spaces, `+`,
 * `-`, `(` and `)`, with at least one digit. Kept as a string — never `Number()`, leading zeros matter.
 */

export const PHONE_MIN_LENGTH = 7;
export const PHONE_MAX_LENGTH = 20;

const PHONE_CHARS = /^[\d\s+\-()]*$/;

/** A complete phone number (after trimming). */
export function isValidPhone(text: string): boolean {
  const v = text.trim();
  return (
    v.length >= PHONE_MIN_LENGTH && v.length <= PHONE_MAX_LENGTH && PHONE_CHARS.test(v) && /\d/.test(v)
  );
}

/**
 * Typing / paste filter: returns the text to keep, or `null` to reject the change (a letter or
 * other character a phone never has, or more than the maximum length). Formatting is left as typed.
 */
export function acceptPhoneInput(text: string): string | null {
  if (!PHONE_CHARS.test(text)) return null;
  return text.length <= PHONE_MAX_LENGTH ? text : null;
}
