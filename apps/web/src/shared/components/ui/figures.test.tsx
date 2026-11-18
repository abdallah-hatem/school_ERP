// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithI18n } from '@/test/render';
import { Money } from './figures';

/*
 * Worst-case amounts (break-ui, owner 2026-11-19): the largest salary the API accepts
 * (2,147,483,647 piastres, an Int column), a month's total above it, a piastre, zero, a negative
 * adjustment. The label and the figure are separate pieces, so a narrow box can put the label on
 * its own line; the figure is always one piece and is never split.
 */
const MAX_SALARY = 2_147_483_647;

describe('Money with worst-case amounts', () => {
  afterEach(cleanup);

  it.each([
    [MAX_SALARY, '21,474,836.47'],
    [99_999_999_999, '999,999,999.99'],
    [1_073_741_823_500, '10,737,418,235.00'],
    [1, '0.01'],
    [0, '0.00'],
    [-999_999_999, '-9,999,999.99'],
  ])('%i piastres: the whole figure as one piece, the label beside it', (value, figure) => {
    const { container } = renderWithI18n(<Money value={value} />);
    const piece = screen.getByText(figure);
    expect(piece.textContent).toBe(figure);
    expect(piece.childNodes).toHaveLength(1);
    const money = container.firstElementChild as HTMLElement;
    expect(money.getAttribute('dir')).toBe('ltr');
    // Label first (left of the figure), as its own piece.
    expect([...money.children].map((c) => c.textContent)).toEqual(['EGP', figure]);
  });

  it('in Arabic the label is still left of the figure, and the figure keeps Latin digits', () => {
    const { container } = renderWithI18n(<Money value={MAX_SALARY} />, { locale: 'ar' });
    const money = container.firstElementChild as HTMLElement;
    expect(money.getAttribute('dir')).toBe('ltr');
    expect([...money.children].map((c) => c.textContent)).toEqual(['ج.م', '21,474,836.47']);
  });

  it('without the label (a table column) only the figure; a hidden amount is a dash', () => {
    const { container, rerender } = renderWithI18n(<Money value={MAX_SALARY} currency={false} />);
    expect(container.textContent).toBe('21,474,836.47');
    rerender(<Money value={undefined} />);
    expect(screen.getByLabelText('Amount hidden').textContent).toBe('—');
  });
});
