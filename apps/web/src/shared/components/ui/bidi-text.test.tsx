// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BidiText, scriptOf } from './bidi-text';

describe('BidiText', () => {
  afterEach(cleanup);

  it('reads the script from the letters', () => {
    expect(scriptOf('الغياب بدون إذن (حرمان من الأجر)')).toBe('ar');
    expect(scriptOf('Unexcused absence, 2 days')).toBe('en');
    expect(scriptOf('EMP-0001 أحمد')).toBeNull();
    expect(scriptOf('1.25')).toBeNull();
  });

  it('isolates Arabic in an English line as RTL Arabic, and English in Arabic as LTR English', () => {
    render(
      <p>
        Old name <BidiText>الغياب (حرمان)</BidiText> and <BidiText>Plus losing the pay</BidiText>
      </p>,
    );
    const arabic = screen.getByText('الغياب (حرمان)');
    expect(arabic.tagName).toBe('BDI');
    expect([arabic.getAttribute('dir'), arabic.getAttribute('lang')]).toEqual(['rtl', 'ar']);
    const english = screen.getByText('Plus losing the pay');
    expect([english.getAttribute('dir'), english.getAttribute('lang')]).toEqual(['ltr', 'en']);
  });

  it('leaves mixed or digit-only text to the browser (dir="auto", no language)', () => {
    render(<BidiText>EMP-0001 أحمد</BidiText>);
    const el = screen.getByText('EMP-0001 أحمد');
    expect(el.getAttribute('dir')).toBe('auto');
    expect(el.hasAttribute('lang')).toBe(false);
  });
});
