import { describe, expect, it } from 'vitest';
import { amountInWordsAr, amountInWordsEn, numberInWordsAr, numberInWordsEn } from './words';

const pounds = (n: number) => n * 100;

describe('amountInWordsAr', () => {
  it.each([
    [0, 'صفر جنيه مصري لا غير'],
    [1, 'جنيه مصري واحد لا غير'],
    [2, 'جنيهان مصريان لا غير'],
    [3, 'ثلاثة جنيهات مصرية لا غير'],
    [10, 'عشرة جنيهات مصرية لا غير'],
    [11, 'أحد عشر جنيهًا مصريًا لا غير'],
    [12, 'اثنا عشر جنيهًا مصريًا لا غير'],
    [25, 'خمسة وعشرون جنيهًا مصريًا لا غير'],
    [100, 'مائة جنيه مصري لا غير'],
    [200, 'مائتا جنيه مصري لا غير'],
    [250, 'مائتان وخمسون جنيهًا مصريًا لا غير'],
    [1_000, 'ألف جنيه مصري لا غير'],
    [2_000, 'ألفا جنيه مصري لا غير'],
    [2_500, 'ألفان وخمسمائة جنيه مصري لا غير'],
    [3_000, 'ثلاثة آلاف جنيه مصري لا غير'],
    [9_500, 'تسعة آلاف وخمسمائة جنيه مصري لا غير'],
    [11_000, 'أحد عشر ألفًا جنيه مصري لا غير'],
    [100_000, 'مائة ألف جنيه مصري لا غير'],
    [200_000, 'مائتا ألف جنيه مصري لا غير'],
    [1_000_000, 'مليون جنيه مصري لا غير'],
    [2_000_000, 'مليونا جنيه مصري لا غير'],
  ])('%i pounds → %s', (n, words) => {
    expect(amountInWordsAr(pounds(n))).toBe(words);
  });

  it('edge case 21: salary with piastres (9,500.50) reads the piastres in words', () => {
    expect(amountInWordsAr(950_050)).toBe('تسعة آلاف وخمسمائة جنيه مصري وخمسون قرشًا لا غير');
  });

  it('edge case 21: salary 1,000,000 (the maximum) → مليون جنيه مصري لا غير', () => {
    expect(amountInWordsAr(100_000_000)).toBe('مليون جنيه مصري لا غير');
  });

  it('piastres use the counted-noun forms: one, two, 3–10, 11+', () => {
    expect(amountInWordsAr(1_01)).toBe('جنيه مصري واحد وقرش واحد لا غير');
    expect(amountInWordsAr(1_02)).toBe('جنيه مصري واحد وقرشان لا غير');
    expect(amountInWordsAr(1_05)).toBe('جنيه مصري واحد وخمسة قروش لا غير');
    expect(amountInWordsAr(1_15)).toBe('جنيه مصري واحد وخمسة عشر قرشًا لا غير');
  });

  it('refuses a negative amount', () => {
    expect(() => amountInWordsAr(-1)).toThrow(RangeError);
  });
});

describe('amountInWordsEn', () => {
  it.each([
    [0, 'Zero Egyptian pounds only'],
    [1, 'One Egyptian pound only'],
    [2, 'Two Egyptian pounds only'],
    [11, 'Eleven Egyptian pounds only'],
    [100, 'One hundred Egyptian pounds only'],
    [1_000, 'One thousand Egyptian pounds only'],
    [2_000, 'Two thousand Egyptian pounds only'],
    [9_500, 'Nine thousand five hundred Egyptian pounds only'],
    [12_345, 'Twelve thousand three hundred forty-five Egyptian pounds only'],
    [1_000_000, 'One million Egyptian pounds only'],
  ])('%i pounds → %s', (n, words) => {
    expect(amountInWordsEn(pounds(n))).toBe(words);
  });

  it('piastres: "and fifty piastres", one piastre singular', () => {
    expect(amountInWordsEn(950_050)).toBe('Nine thousand five hundred Egyptian pounds and fifty piastres only');
    expect(amountInWordsEn(1_01)).toBe('One Egyptian pound and one piastre only');
  });
});

describe('numberInWords', () => {
  it('Arabic tens put the ones first, joined by و', () => {
    expect(numberInWordsAr(99)).toBe('تسعة وتسعون');
    expect(numberInWordsAr(1_234_567)).toBe('مليون ومائتان وأربعة وثلاثون ألفًا وخمسمائة وسبعة وستون');
  });

  it('English joins scales with spaces and tens with a hyphen', () => {
    expect(numberInWordsEn(1_234_567)).toBe('one million two hundred thirty-four thousand five hundred sixty-seven');
  });
});
