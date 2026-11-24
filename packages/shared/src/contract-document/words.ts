import type { Piastres } from '../types/common';

/*
 * Amounts in words for contracts (spec → Fields: "Basic salary in words"). Pure, integer piastres
 * in, the cheque-style sentence out:
 *   9,500     → "تسعة آلاف وخمسمائة جنيه مصري لا غير" / "Nine thousand five hundred Egyptian pounds only"
 *   9,500.50  → "تسعة آلاف وخمسمائة جنيه مصري وخمسون قرشًا لا غير" / "… Egyptian pounds and fifty piastres only"
 * Arabic follows the counted-noun rules: 1 and 2 after the noun (جنيه واحد، جنيهان), 3–10 plural
 * (جنيهات), 11–99 accusative singular (جنيهًا), 100s and round figures singular (جنيه).
 */

/** `list[i]`, or '' (the tables cover every index used). */
const at = (list: readonly string[], i: number): string => list[i] ?? '';

const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const AR_TEENS = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const AR_HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/** 1–99 in words. */
function arBelowHundred(n: number): string {
  if (n < 10) return at(AR_ONES, n);
  if (n < 20) return at(AR_TEENS, n - 10);
  const ones = n % 10;
  const tens = at(AR_TENS, Math.floor(n / 10));
  return ones === 0 ? tens : `${at(AR_ONES, ones)} و${tens}`;
}

/**
 * 1–999 in words. `construct`: directly followed by its counted noun (إضافة), so an exact 200 reads
 * "مائتا" (مائتا ألف، مائتا جنيه).
 */
function arBelowThousand(n: number, construct: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(hundreds === 2 && rest === 0 && construct ? 'مائتا' : at(AR_HUNDREDS, hundreds));
  if (rest > 0) parts.push(arBelowHundred(rest));
  return parts.join(' و');
}

interface ArScale {
  one: string;
  /** Two, alone or followed by more. */
  two: string;
  /** Two, directly followed by the counted noun (ألفا جنيه). */
  twoConstruct: string;
  /** 3–10. */
  plural: string;
  /** 11–99 (accusative singular). */
  accusative: string;
}

const AR_THOUSAND: ArScale = { one: 'ألف', two: 'ألفان', twoConstruct: 'ألفا', plural: 'آلاف', accusative: 'ألفًا' };
const AR_MILLION: ArScale = { one: 'مليون', two: 'مليونان', twoConstruct: 'مليونا', plural: 'ملايين', accusative: 'مليونًا' };
const AR_BILLION: ArScale = { one: 'مليار', two: 'ملياران', twoConstruct: 'مليارا', plural: 'مليارات', accusative: 'مليارًا' };

/** `count` × a scale word (ألف، مليون): ألف، ألفان، ثلاثة آلاف، أحد عشر ألفًا، مائة ألف. */
function arScaled(count: number, scale: ArScale, last: boolean): string {
  if (count === 1) return scale.one;
  if (count === 2) return last ? scale.twoConstruct : scale.two;
  const tail = count % 100;
  const words = arBelowThousand(count, true);
  if (tail >= 3 && tail <= 10) return `${words} ${scale.plural}`;
  if (tail >= 11) return `${words} ${scale.accusative}`;
  return `${words} ${scale.one}`;
}

/** A whole number in Arabic words (0 → "صفر"). `construct`: followed directly by its counted noun. */
export function numberInWordsAr(n: number, construct = true): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Not a whole number: ${n}`);
  if (n === 0) return 'صفر';
  const billions = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const rest = n % 1e3;
  const parts: string[] = [];
  if (billions > 0) parts.push(arScaled(billions, AR_BILLION, millions + thousands + rest === 0 && construct));
  if (millions > 0) parts.push(arScaled(millions, AR_MILLION, thousands + rest === 0 && construct));
  if (thousands > 0) parts.push(arScaled(thousands, AR_THOUSAND, rest === 0 && construct));
  if (rest > 0) parts.push(arBelowThousand(rest, construct));
  return parts.join(' و');
}

interface ArNoun {
  /** After 0, a round figure or 100s: جنيه مصري. */
  singular: string;
  /** 1: the noun then "واحد". */
  one: string;
  /** 2: the dual alone. */
  dual: string;
  /** 3–10. */
  plural: string;
  /** 11–99. */
  accusative: string;
}

const AR_POUND: ArNoun = {
  singular: 'جنيه مصري',
  one: 'جنيه مصري واحد',
  dual: 'جنيهان مصريان',
  plural: 'جنيهات مصرية',
  accusative: 'جنيهًا مصريًا',
};
const AR_PIASTRE: ArNoun = { singular: 'قرش', one: 'قرش واحد', dual: 'قرشان', plural: 'قروش', accusative: 'قرشًا' };

/** `n` of a counted noun: جنيه مصري واحد، جنيهان مصريان، ثلاثة جنيهات مصرية، أحد عشر جنيهًا مصريًا. */
function arCounted(n: number, noun: ArNoun): string {
  if (n === 1) return noun.one;
  if (n === 2) return noun.dual;
  const tail = n % 100;
  const words = numberInWordsAr(n);
  if (n === 0) return `${words} ${noun.singular}`;
  if (tail >= 3 && tail <= 10) return `${words} ${noun.plural}`;
  if (tail >= 11) return `${words} ${noun.accusative}`;
  return `${words} ${noun.singular}`;
}

function split(piastres: Piastres): { pounds: number; rest: number } {
  const whole = Math.round(piastres);
  if (whole < 0) throw new RangeError(`A salary can't be negative: ${piastres}`);
  return { pounds: Math.floor(whole / 100), rest: whole % 100 };
}

/** Integer piastres in Arabic words, cheque style: "… جنيه مصري [و… قرشًا] لا غير". */
export function amountInWordsAr(piastres: Piastres): string {
  const { pounds, rest } = split(piastres);
  const main = arCounted(pounds, AR_POUND);
  return rest === 0 ? `${main} لا غير` : `${main} و${arCounted(rest, AR_PIASTRE)} لا غير`;
}

const EN_ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${at(EN_ONES, hundreds)} hundred`);
  if (rest > 0) {
    if (rest < 20) parts.push(at(EN_ONES, rest));
    else parts.push(rest % 10 === 0 ? at(EN_TENS, rest / 10) : `${at(EN_TENS, Math.floor(rest / 10))}-${at(EN_ONES, rest % 10)}`);
  }
  return parts.join(' ');
}

/** A whole number in English words, lower case (0 → "zero"). */
export function numberInWordsEn(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Not a whole number: ${n}`);
  if (n === 0) return 'zero';
  const scales: Array<[number, string]> = [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  const parts: string[] = [];
  let left = n;
  for (const [size, name] of scales) {
    const count = Math.floor(left / size);
    if (count > 0) parts.push(`${enBelowThousand(count)} ${name}`);
    left %= size;
  }
  if (left > 0) parts.push(enBelowThousand(left));
  return parts.join(' ');
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Integer piastres in English words: "Nine thousand five hundred Egyptian pounds [and fifty piastres] only". */
export function amountInWordsEn(piastres: Piastres): string {
  const { pounds, rest } = split(piastres);
  const main = `${numberInWordsEn(pounds)} Egyptian ${pounds === 1 ? 'pound' : 'pounds'}`;
  const tail = rest === 0 ? '' : ` and ${numberInWordsEn(rest)} ${rest === 1 ? 'piastre' : 'piastres'}`;
  return capitalise(`${main}${tail} only`);
}
