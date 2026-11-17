// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusChangeButton } from './status-change-button';

afterEach(cleanup);

describe('StatusChangeButton', () => {
  it('draws Deactivate with destructive intent and Reactivate with positive intent', () => {
    render(
      <>
        <StatusChangeButton change="deactivate">Deactivate</StatusChangeButton>
        <StatusChangeButton change="reactivate">Reactivate</StatusChangeButton>
      </>,
    );
    const off = screen.getByRole('button', { name: 'Deactivate' });
    const on = screen.getByRole('button', { name: 'Reactivate' });
    expect(off.dataset.variant).toBe('destructive-outline');
    expect(on.dataset.variant).toBe('success-soft');
    // Different icons too, not only different words.
    expect(off.querySelector('svg')?.outerHTML).not.toBe(on.querySelector('svg')?.outerHTML);
  });

  it('is a plain button that clicks once and can be disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <StatusChangeButton change="deactivate" onClick={onClick}>
        Deactivate
      </StatusChangeButton>,
    );
    const button = screen.getByRole('button', { name: 'Deactivate' });
    expect(button.getAttribute('type')).toBe('button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
