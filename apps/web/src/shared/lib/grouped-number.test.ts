import { describe, expect, it } from 'vitest';
import { deleteAcrossComma, groupedEdit } from './grouped-number';

const money = { decimals: 2, allowNegative: false };
const whole = { decimals: 0, allowNegative: false };

describe('groupedEdit', () => {
  it('groups thousands and keeps the caret after the same digit', () => {
    expect(groupedEdit('30000', 5, money)).toEqual({ text: '30,000', caret: 6 });
    expect(groupedEdit('350,000', 2, money)).toEqual({ text: '350,000', caret: 2 });
    expect(groupedEdit('3,0000', 3, money)).toEqual({ text: '30,000', caret: 2 });
  });

  it('keeps a trailing dot and trailing zeros while typing, and a leading dot becomes 0.', () => {
    expect(groupedEdit('12.', 3, money)).toEqual({ text: '12.', caret: 3 });
    expect(groupedEdit('1000.50', 7, money)).toEqual({ text: '1,000.50', caret: 8 });
    expect(groupedEdit('.5', 2, money)).toEqual({ text: '0.5', caret: 3 });
  });

  it('rejects a second dot, a third decimal, a dot in a whole-number field and a stray minus', () => {
    expect(groupedEdit('1.2.', 4, money)).toBeNull();
    expect(groupedEdit('1.234', 5, money)).toBeNull();
    expect(groupedEdit('1.5', 2, whole)).toBeNull();
    expect(groupedEdit('1-5', 2, { decimals: 0, allowNegative: true })).toBeNull();
  });

  it('ignores letters (caret unmoved), drops leading zeros and reads Arabic-Indic digits', () => {
    expect(groupedEdit('1x234', 2, money)).toEqual({ text: '1,234', caret: 1 });
    expect(groupedEdit('05', 2, whole)).toEqual({ text: '5', caret: 1 });
    expect(groupedEdit('٣٠٠٠٠', 5, money)).toEqual({ text: '30,000', caret: 6 });
    expect(groupedEdit('-5', 2, whole)).toEqual({ text: '5', caret: 1 });
    expect(groupedEdit('-1200', 5, { decimals: 0, allowNegative: true })).toEqual({ text: '-1,200', caret: 6 });
  });
});

describe('deleteAcrossComma', () => {
  it('Backspace after a comma removes the digit before it; Delete before one removes the digit after', () => {
    expect(deleteAcrossComma('30,000', 3, 3, 'Backspace')).toEqual({ value: '3,000', caret: 1 });
    expect(deleteAcrossComma('3,000', 1, 1, 'Delete')).toEqual({ value: '3,00', caret: 2 });
    expect(deleteAcrossComma('30,000', 2, 2, 'Backspace')).toBeNull();
    expect(deleteAcrossComma('30,000', 0, 3, 'Backspace')).toBeNull();
  });
});
