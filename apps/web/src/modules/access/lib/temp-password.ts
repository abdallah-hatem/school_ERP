import { PASSWORD_MIN_LENGTH } from '@school-erp/shared';

/*
 * Temporary passwords an admin reads out or writes down for someone (R9): two short words and four
 * digits, `Kite-4827-Moss` — easy to say over the phone, no look-alike letters, and well over the
 * minimum length. Made in the browser with the platform's secure random numbers; the API stores
 * only its hash and the user must replace it at their first sign-in.
 */

const WORDS = [
  'Amber', 'Basil', 'Birch', 'Cedar', 'Cloud', 'Coral', 'Delta', 'Ember',
  'Fern', 'Flint', 'Frost', 'Grove', 'Harbor', 'Hazel', 'Iris', 'Jade',
  'Kite', 'Lake', 'Lemon', 'Lotus', 'Maple', 'Meadow', 'Mint', 'Moss',
  'Nectar', 'Oasis', 'Olive', 'Orbit', 'Palm', 'Pearl', 'Pine', 'Plum',
  'Prism', 'Quartz', 'Raven', 'Reef', 'River', 'Robin', 'Sage', 'Sand',
  'Shell', 'Sky', 'Slate', 'Spark', 'Stone', 'Sun', 'Swan', 'Thyme',
  'Tide', 'Tulip', 'Vale', 'Wave', 'Willow', 'Wind', 'Zest', 'Zinc',
] as const;

type RandomInts = (count: number) => Uint32Array;

const secureRandom: RandomInts = (count) => crypto.getRandomValues(new Uint32Array(count));

/** A fresh temporary password. `random` is for tests only. */
export function generateTemporaryPassword(random: RandomInts = secureRandom): string {
  const [a = 0, b = 0, n = 0] = random(3);
  const digits = String(1000 + (n % 9000));
  const password = `${WORDS[a % WORDS.length]}-${digits}-${WORDS[b % WORDS.length]}`;
  // The shortest combination (`Sky-1000-Sun`) is 12 characters, above the minimum; the guard keeps
  // it so if the minimum ever rises.
  return password.length >= PASSWORD_MIN_LENGTH ? password : `${password}-${digits}`;
}
