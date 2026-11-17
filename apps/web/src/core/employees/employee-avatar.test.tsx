// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmployeeAvatar } from './employee-avatar';

afterEach(cleanup);

const avatar = (container: HTMLElement) => container.querySelector('[data-avatar]') as HTMLElement;

describe('EmployeeAvatar', () => {
  it('no photo → the neutral silhouette, never initials', () => {
    const { container } = render(<EmployeeAvatar photoUrl={null} />);
    expect(avatar(container).dataset.avatar).toBe('silhouette');
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(avatar(container).textContent).toBe('');
  });

  it('a photo → the image, square-cropped; decorative for screen readers', () => {
    const { container } = render(<EmployeeAvatar photoUrl="/files/employee-photos/e1-a.jpg" size="lg" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(avatar(container).dataset.avatar).toBe('photo');
    expect(img.getAttribute('src')).toContain('/files/employee-photos/e1-a.jpg');
    expect(img.className).toContain('object-cover');
    expect(img.getAttribute('alt')).toBe('');
    expect(avatar(container).getAttribute('aria-hidden')).toBe('true');
  });

  it('a photo that fails to load falls back to the silhouette', () => {
    const { container } = render(<EmployeeAvatar photoUrl="/files/employee-photos/gone.png" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(avatar(container).dataset.avatar).toBe('silhouette');
    expect(container.querySelector('img')).toBeNull();
  });
});
