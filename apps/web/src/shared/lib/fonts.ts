import { IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans, Tajawal } from 'next/font/google';

/*
 * Self-hosted through next/font. The Latin face sits ahead of the Arabic faces in every stack, so
 * it gets `adjustFontFallback: false` plus an explicit Arabic `fallback` — otherwise next/font's
 * generated Arial fallback claims Arabic glyphs and the Arabic face never loads
 * (building-frontends → design-system → Type).
 */
export const latinFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-latin',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
});

export const arabicFont = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const arabicDisplayFont = Tajawal({
  subsets: ['arabic'],
  weight: ['500', '700', '800'],
  variable: '--font-arabic-display',
  display: 'swap',
});

export const fontVariables = [latinFont.variable, arabicFont.variable, arabicDisplayFont.variable].join(
  ' ',
);
