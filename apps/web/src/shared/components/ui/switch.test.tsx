// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './switch';

afterEach(cleanup);

describe('Switch', () => {
  it('flips when it is not pending', async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Contract" checked={false} onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Contract' });
    expect(sw.hasAttribute('data-pending')).toBe(false);
    expect(sw.getAttribute('aria-busy')).toBeNull();
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('pending: busy and marked for the dimmed look, focusable (not disabled), and a click changes nothing', async () => {
    const onChange = vi.fn();
    const onClick = vi.fn();
    render(<Switch aria-label="Contract" pending checked onCheckedChange={onChange} onClick={onClick} />);
    const sw = screen.getByRole('switch', { name: 'Contract' }) as HTMLButtonElement;
    expect(sw.hasAttribute('data-pending')).toBe(true);
    expect(sw.getAttribute('aria-busy')).toBe('true');
    expect(sw.getAttribute('aria-disabled')).toBe('true');
    expect(sw.disabled).toBe(false);
    await userEvent.click(sw);
    expect(document.activeElement).toBe(sw);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('pending in an uncontrolled switch keeps its value', async () => {
    render(<Switch aria-label="Contract" pending defaultChecked={false} />);
    const sw = screen.getByRole('switch', { name: 'Contract' });
    await userEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('the pending look dims the track only: the thumb keeps its colour, size and shadow, and no spinner is drawn', () => {
    render(<Switch aria-label="Contract" pending checked />);
    const sw = screen.getByRole('switch', { name: 'Contract' });
    expect(sw.className).toMatch(/data-pending:data-\[state=checked\]:bg-primary\/50/);
    expect(sw.className).toMatch(/data-pending:data-\[state=unchecked\]:bg-muted-foreground\/35/);
    expect(sw.className).not.toMatch(/data-pending:opacity/);
    const thumb = sw.firstElementChild as HTMLElement;
    expect(thumb.className).toMatch(/size-6/);
    expect(thumb.className).toMatch(/bg-card/);
    expect(thumb.className).toMatch(/shadow-card/);
    expect(sw.querySelector('svg, [role="status"]')).toBeNull();
  });

  it('inside a form Radix adds a hidden native twin — aria-hidden, so the skeleton mask leaves it unpainted', () => {
    render(
      <form>
        <Switch aria-label="Contract" checked />
      </form>,
    );
    const twin = document.querySelector('form input[type="checkbox"]');
    expect(twin?.getAttribute('aria-hidden')).toBe('true');
    const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');
    const mask = css
      .slice(css.indexOf('@utility skeleton-mask'), css.indexOf('@utility flip-rtl'))
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // Every rule of the mask that paints inputs skips the aria-hidden twins.
    const inputs = mask.match(/\binput\b/g)?.length ?? 0;
    const visibleOnly = mask.match(/\binput:not\(\[aria-hidden="true"\]\)/g)?.length ?? 0;
    expect(inputs).toBeGreaterThan(0);
    expect(visibleOnly).toBe(inputs);
  });
});
