'use client';

import { useId } from 'react';
import { cn } from '@/shared/lib/utils';
import styles from './error-art.module.css';

/*
 * The art of the not-found and error screens (design/mockups/error-pages.html on the `design`
 * branch, option 2 · "Big number, light art", owner's pick). Fixed inline SVG shapes — the "4"s are
 * paths, not text, so no font can change them — in the brand's teal and sunflower. Decorative only
 * (`aria-hidden`): the heading under it says what happened. It never mirrors in Arabic: "404" reads
 * the same in both languages.
 */

/** Unique ids per instance (two pieces of art on a page must not share gradients). */
function useSvgId(): (name: string) => string {
  const base = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (name) => `ea${base}-${name}`;
}

/** A heavy "4" on a 152 × 165 box: the outer shape and its triangular counter (even-odd). */
const FOUR_PATH =
  'M86 0H124Q132 0 132 8V104H146Q152 104 152 110V132Q152 138 146 138H132V159Q132 165 126 165H98Q92 165 92 159V138H8Q0 138 0 130V112Q0 106 4 101L78 4Q81 0 86 0ZM92 38V104H42Z';

/** The soft-3D extrusion: the same shape stacked down and to the side, darker underneath. */
const DEPTH = [9, 8, 7, 6, 5, 4, 3, 2, 1];

function Four({ x, id }: { x: number; id: (name: string) => string }) {
  return (
    <g transform={`translate(${x} 61)`}>
      {DEPTH.map((i) => (
        <path
          key={i}
          d={FOUR_PATH}
          fillRule="evenodd"
          fill="#07493e"
          opacity={(0.5 + i * 0.04).toFixed(2)}
          transform={`translate(${(i * 0.7).toFixed(1)} ${(i * 1.1).toFixed(1)})`}
        />
      ))}
      <path d={FOUR_PATH} fillRule="evenodd" fill={`url(#${id('teal')})`} />
      <path d={FOUR_PATH} fillRule="evenodd" fill={`url(#${id('shine')})`} />
    </g>
  );
}

function Sparkle({ d, delay }: { d: string; delay?: string }) {
  return <path className={styles.twinkle} style={delay ? { animationDelay: delay } : undefined} d={d} fill="#ffc43d" />;
}

/** "404": two teal 4s, the 0 a sunflower ball holding a page, a paper plane and sparkles. */
export function NotFoundArt({ className }: { className?: string }) {
  const id = useSvgId();
  return (
    <svg
      viewBox="0 0 560 270"
      aria-hidden="true"
      focusable="false"
      data-art="not-found"
      className={cn('block h-auto w-full', className)}
    >
      <defs>
        <linearGradient id={id('teal')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fd0ab" />
          <stop offset=".55" stopColor="#119a80" />
          <stop offset="1" stopColor="#0b7a68" />
        </linearGradient>
        <linearGradient id={id('shine')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('sun')} cx=".36" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".45" stopColor="#ffd35f" />
          <stop offset="1" stopColor="#e59c14" />
        </radialGradient>
        <radialGradient id={id('inner')} cx=".5" cy=".5" r=".5">
          <stop offset=".55" stopColor="#fff8e1" />
          <stop offset="1" stopColor="#ffe8a8" />
        </radialGradient>
        <filter id={id('blur')}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={id('shadow')} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#07493e" floodOpacity=".22" />
        </filter>
      </defs>
      <ellipse cx="280" cy="250" rx="230" ry="12" fill="#07493e" opacity=".14" filter={`url(#${id('blur')})`} />
      <Four x={38} id={id} />
      <Four x={370} id={id} />
      <g className={styles.float}>
        <circle cx="286" cy="148" r="82" fill="#b8770a" opacity=".35" filter={`url(#${id('blur')})`} transform="translate(4 10)" />
        <circle cx="282" cy="140" r="82" fill={`url(#${id('sun')})`} />
        <circle cx="282" cy="140" r="44" fill={`url(#${id('inner')})`} />
        <circle cx="282" cy="140" r="44" fill="none" stroke="#b8770a" strokeOpacity=".25" strokeWidth="3" />
        <path d="M226 104a70 70 0 0 1 48-34" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".65" />
        <g transform="translate(282 142) rotate(-12)">
          <rect x="-17" y="-22" width="34" height="44" rx="4" fill="#fff" filter={`url(#${id('shadow')})`} />
          <path d="M8 -22h5q4 0 4 4v4z" fill="#e7ddc6" />
          <rect x="-11" y="-14" width="15" height="3.4" rx="1.7" fill="#0b7a68" opacity=".8" />
          <rect x="-11" y="-6" width="22" height="2.6" rx="1.3" fill="#cde9e1" />
          <rect x="-11" y="-.5" width="19" height="2.6" rx="1.3" fill="#cde9e1" />
          <rect x="-11" y="5" width="22" height="2.6" rx="1.3" fill="#cde9e1" />
          <rect x="-11" y="11" width="9" height="4.4" rx="1.4" fill="#ffc43d" />
        </g>
      </g>
      <g className={styles.float} style={{ animationDelay: '1s' }}>
        <g transform="translate(372 36) rotate(-18)">
          <path d="M-14 -9L16 0L-14 9L-7 0Z" fill="#0b7a68" />
          <path d="M-7 0L16 0L-14 9Z" fill="#07493e" opacity=".45" />
        </g>
        <path d="M350 46q-14 6-26 2" stroke="#0b7a68" strokeOpacity=".35" strokeWidth="2" fill="none" strokeDasharray="2 4" strokeLinecap="round" />
      </g>
      <Sparkle d="M500 40l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
      <Sparkle d="M30 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" delay="1s" />
      <circle cx="530" cy="196" r="7" fill="#d5efe8" />
      <circle cx="18" cy="170" r="5" fill="#bfe6db" />
      <circle cx="196" cy="34" r="4" fill="#ffc43d" opacity=".7" />
    </svg>
  );
}

/** A calm sunflower "!" ball inside a teal ring, with a cube, a bead and sparkles. */
export function ErrorArt({ className }: { className?: string }) {
  const id = useSvgId();
  return (
    <svg
      viewBox="0 0 400 250"
      aria-hidden="true"
      focusable="false"
      data-art="error"
      className={cn('block h-auto w-full', className)}
    >
      <defs>
        <radialGradient id={id('sun')} cx=".36" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".45" stopColor="#ffd35f" />
          <stop offset="1" stopColor="#e59c14" />
        </radialGradient>
        <linearGradient id={id('teal')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fd0ab" />
          <stop offset="1" stopColor="#0b7a68" />
        </linearGradient>
        <filter id={id('blur')}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <ellipse cx="200" cy="232" rx="120" ry="10" fill="#07493e" opacity=".14" filter={`url(#${id('blur')})`} />
      <ellipse cx="200" cy="150" rx="150" ry="40" fill="none" stroke="#bfe6db" strokeWidth="10" transform="rotate(-8 200 150)" />
      <g className={styles.float}>
        <circle cx="204" cy="132" r="88" fill="#b8770a" opacity=".3" filter={`url(#${id('blur')})`} />
        <circle cx="200" cy="122" r="88" fill={`url(#${id('sun')})`} />
        <path d="M138 80a76 76 0 0 1 50-34" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" opacity=".6" />
        <rect x="188" y="66" width="24" height="70" rx="12" fill="#07493e" opacity=".9" />
        <rect x="190" y="66" width="8" height="66" rx="4" fill="#fff" opacity=".18" />
        <circle cx="200" cy="166" r="13" fill="#07493e" opacity=".9" />
        <circle cx="196" cy="162" r="4" fill="#fff" opacity=".2" />
      </g>
      <path d="M50 150A150 40 0 0 0 350 150" stroke="#8fd8c3" strokeWidth="10" fill="none" strokeLinecap="round" transform="rotate(-8 200 150)" opacity=".95" />
      <g className={styles.float} style={{ animationDelay: '1.2s' }}>
        <rect x="318" y="46" width="30" height="30" rx="9" fill={`url(#${id('teal')})`} transform="rotate(14 333 61)" />
        <rect x="322" y="50" width="10" height="7" rx="3" fill="#fff" opacity=".3" transform="rotate(14 333 61)" />
      </g>
      <g className={styles.float} style={{ animationDelay: '.6s' }}>
        <circle cx="70" cy="190" r="12" fill={`url(#${id('teal')})`} />
        <ellipse cx="66" cy="185" rx="4" ry="2.6" fill="#fff" opacity=".35" />
      </g>
      <Sparkle d="M76 46l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
      <Sparkle d="M340 186l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" delay="1.1s" />
    </svg>
  );
}
