/**
 * Money rounding (§6): every amount is rounded to the nearest piastre, half up, after multiplying.
 * The maths runs on integers (BigInt) so a value like 41,666.5 can't drift to 41,666.4999….
 */

function assertSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, got ${value}`);
  }
}

/**
 * `numerator ÷ denominator`, rounded half up, for non-negative integers.
 *
 * @example divRoundHalfUp(1_250_001, 30) // 41,667 (41,666.7)
 * @example divRoundHalfUp(5, 2)          // 3 (2.5 rounds up)
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  assertSafeInteger('numerator', numerator);
  assertSafeInteger('denominator', denominator);
  if (numerator < 0) throw new RangeError(`numerator must be ≥ 0, got ${numerator}`);
  if (denominator <= 0) throw new RangeError(`denominator must be > 0, got ${denominator}`);

  const n = BigInt(numerator);
  const d = BigInt(denominator);
  // floor((2n + d) / 2d) = round half up of n / d for n ≥ 0, d > 0.
  return Number((2n * n + d) / (2n * d));
}

/**
 * `a × b ÷ c` rounded half up, multiplying first so nothing is rounded in between
 * (§6 GUESS: the day value is never rounded on its own).
 */
export function mulDivRoundHalfUp(a: number, b: number, c: number): number {
  assertSafeInteger('a', a);
  assertSafeInteger('b', b);
  const product = BigInt(a) * BigInt(b);
  if (product > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`a × b is too large: ${a} × ${b}`);
  }
  return divRoundHalfUp(Number(product), c);
}
