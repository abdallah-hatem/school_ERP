import { describe, expect, it } from 'vitest';
import { formatMoneyText } from './format';

const NBSP = ' ';

describe('formatMoneyText (money inside a sentence)', () => {
  it('the label left of the figure in both languages, joined so a wrap never splits them', () => {
    expect(formatMoneyText(2_147_483_647, 'en', 'EGP')).toBe(`EGP${NBSP}21,474,836.47`);
    // Logical order figure-then-label: an Arabic line draws the label on the left.
    expect(formatMoneyText(2_147_483_647, 'ar', 'ج.م')).toBe(`21,474,836.47${NBSP}ج.م`);
    expect(formatMoneyText(99_999_999_999, 'en', 'EGP')).not.toContain(' ');
  });

  it('zero and a piastre; a hidden amount is a dash with no label', () => {
    expect(formatMoneyText(0, 'en', 'EGP')).toBe(`EGP${NBSP}0.00`);
    expect(formatMoneyText(1, 'ar', 'ج.م')).toBe(`0.01${NBSP}ج.م`);
    expect(formatMoneyText(undefined, 'en', 'EGP')).toBe('—');
  });
});
