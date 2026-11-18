// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PersonAvatar } from './person-avatar';

afterEach(cleanup);

const avatar = (container: HTMLElement) => container.querySelector('[data-avatar]') as HTMLElement;

describe('PersonAvatar', () => {
  it('no photo → the neutral silhouette, never initials', () => {
    const { container } = render(<PersonAvatar photoUrl={null} />);
    expect(avatar(container).dataset.avatar).toBe('silhouette');
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(avatar(container).textContent).toBe('');
  });

  it.each([
    ['MALE', 'male'],
    ['FEMALE', 'female'],
  ] as const)('no photo, gender %s → the %s silhouette', (gender, variant) => {
    const { container } = render(<PersonAvatar photoUrl={null} gender={gender} size="sm" />);
    expect(avatar(container).dataset.avatar).toBe('silhouette');
    expect(container.querySelector('svg')?.getAttribute('data-silhouette')).toBe(variant);
  });

  it('unknown gender (an account with no linked employee) → the neutral silhouette', () => {
    for (const gender of [undefined, null]) {
      const { container, unmount } = render(<PersonAvatar photoUrl={null} gender={gender} />);
      expect(container.querySelector('svg')?.getAttribute('data-silhouette')).toBe('neutral');
      expect(avatar(container).textContent).toBe('');
      unmount();
    }
  });

  it('muted (an inactive person) greys the silhouette and the photo', () => {
    const { container, rerender } = render(<PersonAvatar photoUrl={null} muted />);
    expect(avatar(container).className).toContain('opacity-70');
    rerender(<PersonAvatar photoUrl="/files/employee-photos/e1-a.jpg" muted />);
    expect(container.querySelector('img')?.className).toContain('grayscale');
  });

  it('a photo wins over the gendered silhouette', () => {
    const { container } = render(<PersonAvatar photoUrl="/files/employee-photos/e2-b.jpg" gender="FEMALE" />);
    expect(avatar(container).dataset.avatar).toBe('photo');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('a photo → the image, square-cropped; decorative for screen readers', () => {
    const { container } = render(<PersonAvatar photoUrl="/files/employee-photos/e1-a.jpg" size="lg" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(avatar(container).dataset.avatar).toBe('photo');
    expect(img.getAttribute('src')).toContain('/files/employee-photos/e1-a.jpg');
    expect(img.className).toContain('object-cover');
    expect(img.getAttribute('alt')).toBe('');
    expect(avatar(container).getAttribute('aria-hidden')).toBe('true');
  });

  it('a photo that fails to load falls back to the silhouette (gendered when known)', () => {
    const { container } = render(<PersonAvatar photoUrl="/files/employee-photos/gone.png" gender="MALE" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(avatar(container).dataset.avatar).toBe('silhouette');
    expect(container.querySelector('[data-silhouette]')?.getAttribute('data-silhouette')).toBe('male');
    expect(container.querySelector('img')).toBeNull();
  });
});
