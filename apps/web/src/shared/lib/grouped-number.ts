/*
 * Live thousands grouping for number inputs (`30000` → `30,000` while typing) with the caret kept
 * where the person is. The caret is tracked by how many meaningful characters (digits, the dot,
 * the minus) sit before it, so inserting or removing a comma never moves it. Pure, so the field
 * component stays thin and the rules are unit-tested.
 */

export interface GroupingOptions {
  /** Decimal places that may be typed (0 = whole numbers only). */
  decimals: number;
  allowNegative: boolean;
}

export interface GroupedEdit {
  text: string;
  caret: number;
}

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/** Arabic-Indic digits → Latin, so a person on an Arabic keyboard still types a figure. */
function latinDigits(text: string): string {
  return text.replace(ARABIC_INDIC, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/** Keep only what can be part of the number; letters, spaces and commas are ignored. */
function meaningful(text: string, { allowNegative }: GroupingOptions): string {
  return latinDigits(text).replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, '');
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Caret index after the n-th meaningful character of `text` (commas skipped). */
function caretAfter(text: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ',' && ++seen === n) return i + 1;
  }
  return text.length;
}

/**
 * The person's edit (`value` with the caret at `caret`) → the grouped text and where the caret
 * goes, or `null` when the edit can never become a valid number (a second dot, a third decimal, a
 * minus mid-number) and must be rejected rather than trimmed.
 */
export function groupedEdit(value: string, caret: number, options: GroupingOptions): GroupedEdit | null {
  const kept = meaningful(value, options);
  const pattern =
    options.decimals > 0
      ? new RegExp(`^${options.allowNegative ? '-?' : ''}\\d*(\\.\\d{0,${options.decimals}})?$`)
      : new RegExp(`^${options.allowNegative ? '-?' : ''}\\d*$`);
  if (!pattern.test(kept)) return null;

  const sign = kept.startsWith('-') ? '-' : '';
  const [rawInt = '', dec] = kept.slice(sign.length).split('.');
  const int = rawInt.replace(/^0+(?=\d)/, '');
  const zerosDropped = rawInt.length - int.length;
  const zeroAdded = dec !== undefined && int === '';
  const text = `${sign}${groupThousands(zeroAdded ? '0' : int)}${dec === undefined ? '' : `.${dec}`}`;

  const before = meaningful(value.slice(0, caret), options);
  const leadingZeros = /^-?(0*)/.exec(before)?.[1]?.length ?? 0;
  let n = before.length - Math.min(zerosDropped, leadingZeros);
  if (zeroAdded && n > sign.length) n += 1;
  return { text, caret: caretAfter(text, n) };
}

/**
 * Backspace right after a comma (or Delete right before one) removes the digit beyond it — the
 * comma would only come straight back. Returns the edit to apply, or `null` for a normal key.
 */
export function deleteAcrossComma(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: string,
): { value: string; caret: number } | null {
  if (selectionStart !== selectionEnd) return null;
  const at = selectionStart;
  if (key === 'Backspace' && at >= 2 && value[at - 1] === ',') {
    return { value: value.slice(0, at - 2) + value.slice(at - 1), caret: at - 2 };
  }
  if (key === 'Delete' && value[at] === ',' && at + 1 < value.length) {
    return { value: value.slice(0, at + 1) + value.slice(at + 2), caret: at + 1 };
  }
  return null;
}
