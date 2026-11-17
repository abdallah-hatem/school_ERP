import { compare, hash } from 'bcryptjs';

/** bcrypt cost. ~250 ms per hash on a laptop — slow enough to resist guessing, fast enough to sign in. */
export const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string, rounds: number = BCRYPT_ROUNDS): Promise<string> {
  return hash(plain, rounds);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}

/** Emails are compared case-insensitively and stored lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
