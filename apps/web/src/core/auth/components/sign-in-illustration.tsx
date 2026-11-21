import type { ReactNode } from 'react';
import styles from './sign-in.module.css';

/** What the two floating cards say, in the page's language. */
export interface SignInArtCopy {
  payroll: string;
  payrollDetail: string;
  attendance: string;
  attendanceDetail: string;
}

type CardIcon = (cx: number, cy: number) => ReactNode;

const checkIcon: CardIcon = (cx, cy) => (
  <>
    <circle cx={cx} cy={cy} r="11" fill="url(#signin-art-folder)" />
    <ellipse cx={cx - 3} cy={cy - 5} rx="5" ry="3" fill="#fff" opacity=".35" />
    <path
      d={`M${cx - 4.6} ${cy + 0.2}l3 3 6.2-6.6`}
      stroke="#fff"
      strokeWidth="2.3"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

const userIcon: CardIcon = (cx, cy) => (
  <>
    <circle cx={cx} cy={cy} r="11" fill="url(#signin-art-barT)" />
    <ellipse cx={cx - 3} cy={cy - 5} rx="5" ry="3" fill="#fff" opacity=".25" />
    <circle cx={cx} cy={cy - 2.6} r="2.9" fill="#fff" />
    <path
      d={`M${cx - 5.2} ${cy + 6}q5.2-6.6 10.4 0`}
      stroke="#fff"
      strokeWidth="2.2"
      fill="none"
      strokeLinecap="round"
    />
  </>
);

/** A floating card over the art: the icon at the inline start, two lines of text; mirrors in Arabic. */
function FloatingCard({
  x,
  y,
  w,
  h,
  rtl,
  title,
  detail,
  icon,
  delay,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rtl: boolean;
  title: string;
  detail: string;
  icon: CardIcon;
  delay: number;
}) {
  const iconX = rtl ? x + w - h / 2 : x + h / 2;
  const textX = rtl ? x + w - h + 2 : x + h - 2;
  const direction = rtl ? 'rtl' : 'ltr';
  return (
    <g className={styles.bob} style={{ animationDelay: `${delay}s` }}>
      <rect x={x} y={y} width={w} height={h} rx="12" fill="#fff" filter="url(#signin-art-card)" />
      {icon(iconX, y + h / 2)}
      <text
        x={textX}
        y={y + h / 2 - 2.5}
        direction={direction}
        textAnchor="start"
        fontSize="9.6"
        fontWeight="700"
        fill="#11302b"
      >
        {title}
      </text>
      <text
        x={textX}
        y={y + h / 2 + 9}
        direction={direction}
        textAnchor="start"
        fontSize="8"
        fontWeight="500"
        fill="#587069"
      >
        {detail}
      </text>
    </g>
  );
}

/**
 * The sign-in page's office scene in soft 3D (Q1 of design/mockups/login-s2-quality.html, picked by
 * the owner): a window with the school, a shelf, a clock, the desk, the monitor whose bars grow in,
 * the teacher in a sunflower hijab, her colleague, the plant and a sunbeam, with two cards bobbing
 * over it. Pure decoration (`aria-hidden`): the art is drawn once and never mirrors; in Arabic only
 * the cards' text and icons swap sides. Its colours are the illustration's own palette, drawn from
 * the Campus tokens. Every id starts with `signin-art-` so nothing else on a page can collide.
 * On phones and tablets `styles.crop` shows its middle, as in the mockup's phone frame.
 */
export function SignInIllustration({
  copy,
  rtl,
  className,
}: {
  copy: SignInArtCopy;
  rtl: boolean;
  className?: string;
}) {
  return (
    <div className={[styles.crop, className].filter(Boolean).join(' ')}>
      <svg viewBox="0 0 400 300" width="100%" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="signin-art-wall" cx=".2" cy=".08" r="1.1">
            <stop offset="0" stopColor="#fdfefb" />
            <stop offset=".45" stopColor="#e3f3ee" />
            <stop offset="1" stopColor="#c1e2d7" />
          </radialGradient>
          <linearGradient id="signin-art-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c9e7dd" />
            <stop offset="1" stopColor="#a6d4c6" />
          </linearGradient>
          <linearGradient id="signin-art-beam" x1="0" y1="0" x2=".55" y2="1">
            <stop offset="0" stopColor="#fff4cf" stopOpacity=".95" />
            <stop offset=".7" stopColor="#fff4cf" stopOpacity=".25" />
            <stop offset="1" stopColor="#fff4cf" stopOpacity="0" />
          </linearGradient>
          <filter id="signin-art-ao" x="-50%" y="-80%" width="200%" height="260%">
            <feGaussianBlur stdDeviation="3.6" />
          </filter>
          <filter id="signin-art-ao2" x="-50%" y="-80%" width="200%" height="260%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
          <filter id="signin-art-card" x="-30%" y="-50%" width="160%" height="220%">
            <feDropShadow dx="0" dy="5" stdDeviation="5.5" floodColor="#07493e" floodOpacity=".2" />
          </filter>
          <linearGradient id="signin-art-frame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cbe5dc" />
          </linearGradient>
          <linearGradient id="signin-art-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe29a" />
            <stop offset=".5" stopColor="#fff3d6" />
            <stop offset="1" stopColor="#d4f0e7" />
          </linearGradient>
          <radialGradient id="signin-art-sun" cx=".38" cy=".35">
            <stop offset="0" stopColor="#fff8dc" />
            <stop offset=".6" stopColor="#ffd35f" />
            <stop offset="1" stopColor="#f4ad1a" />
          </radialGradient>
          <linearGradient id="signin-art-bld" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d3eae2" />
          </linearGradient>
          <linearGradient id="signin-art-roof" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2ac7a4" />
            <stop offset="1" stopColor="#0b7a68" />
          </linearGradient>
          <radialGradient id="signin-art-tree" cx=".35" cy=".3" r=".75">
            <stop offset="0" stopColor="#a3ead4" />
            <stop offset=".55" stopColor="#22ae90" />
            <stop offset="1" stopColor="#0b6d5c" />
          </radialGradient>
          <linearGradient id="signin-art-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fdeed6" />
            <stop offset="1" stopColor="#eccea2" />
          </linearGradient>
          <linearGradient id="signin-art-woodT" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3e0" />
            <stop offset="1" stopColor="#efd3a8" />
          </linearGradient>
          <linearGradient id="signin-art-woodF" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e6c08b" />
            <stop offset="1" stopColor="#c99760" />
          </linearGradient>
          <linearGradient id="signin-art-panel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c99a62" />
            <stop offset=".25" stopColor="#ddb47e" />
            <stop offset="1" stopColor="#e8c899" />
          </linearGradient>
          <linearGradient id="signin-art-dark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#355f57" />
            <stop offset="1" stopColor="#0c231f" />
          </linearGradient>
          <linearGradient id="signin-art-scr" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e6f4ef" />
          </linearGradient>
          <linearGradient id="signin-art-barT" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#52dbb8" />
            <stop offset="1" stopColor="#0b7a68" />
          </linearGradient>
          <linearGradient id="signin-art-barY" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe394" />
            <stop offset="1" stopColor="#f2a516" />
          </linearGradient>
          <radialGradient id="signin-art-skin" cx=".4" cy=".32" r=".78">
            <stop offset="0" stopColor="#fde6d4" />
            <stop offset=".6" stopColor="#efc2a1" />
            <stop offset="1" stopColor="#d69d78" />
          </radialGradient>
          <radialGradient id="signin-art-skin2" cx=".38" cy=".32" r=".8">
            <stop offset="0" stopColor="#f3cdac" />
            <stop offset=".6" stopColor="#d9a079" />
            <stop offset="1" stopColor="#b67a52" />
          </radialGradient>
          <radialGradient id="signin-art-hijab" cx=".35" cy=".22" r=".95">
            <stop offset="0" stopColor="#46d0ad" />
            <stop offset=".5" stopColor="#119a80" />
            <stop offset="1" stopColor="#06463b" />
          </radialGradient>
          <linearGradient id="signin-art-sweater" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe697" />
            <stop offset=".55" stopColor="#ffc43d" />
            <stop offset="1" stopColor="#e59c14" />
          </linearGradient>
          <linearGradient id="signin-art-shirt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a6ecd8" />
            <stop offset=".5" stopColor="#3cc0a0" />
            <stop offset="1" stopColor="#138c73" />
          </linearGradient>
          <linearGradient id="signin-art-pants" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3a5f58" />
            <stop offset="1" stopColor="#10241f" />
          </linearGradient>
          <linearGradient id="signin-art-hair" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5a463a" />
            <stop offset="1" stopColor="#1c1410" />
          </linearGradient>
          <linearGradient id="signin-art-lid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#c9ded8" />
          </linearGradient>
          <linearGradient id="signin-art-chair" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#25b897" />
            <stop offset="1" stopColor="#07493e" />
          </linearGradient>
          <linearGradient id="signin-art-pot" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".55" stopColor="#e6f0ed" />
            <stop offset="1" stopColor="#bcd3cb" />
          </linearGradient>
          <linearGradient id="signin-art-leafA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#64dcba" />
            <stop offset="1" stopColor="#0a7563" />
          </linearGradient>
          <linearGradient id="signin-art-leafB" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9df0d6" />
            <stop offset="1" stopColor="#17a083" />
          </linearGradient>
          <radialGradient id="signin-art-clock" cx=".4" cy=".35">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e1f0eb" />
          </radialGradient>
          <linearGradient id="signin-art-mug" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffe08a" />
            <stop offset="1" stopColor="#e99f15" />
          </linearGradient>
          <linearGradient id="signin-art-folder" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffdd7e" />
            <stop offset="1" stopColor="#eea31a" />
          </linearGradient>
          <radialGradient id="signin-art-scarf" cx=".34" cy=".22" r=".9">
            <stop offset="0" stopColor="#fff1c2" />
            <stop offset=".35" stopColor="#ffcc52" />
            <stop offset=".75" stopColor="#eba51c" />
            <stop offset="1" stopColor="#b8770a" />
          </radialGradient>
          <linearGradient id="signin-art-cardi" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3ccaa8" />
            <stop offset=".55" stopColor="#12927a" />
            <stop offset="1" stopColor="#075a4c" />
          </linearGradient>
          <linearGradient id="signin-art-cream" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffdf7" />
            <stop offset="1" stopColor="#eadcc0" />
          </linearGradient>
          <clipPath id="signin-art-win">
            <rect x="32" y="36" width="106" height="90" rx="8" />
          </clipPath>
        </defs>
        <rect width="400" height="300" fill="url(#signin-art-wall)" />
        <rect y="236" width="400" height="64" fill="url(#signin-art-floor)" />
        <rect y="231" width="400" height="7" fill="#f6fcfa" />
        <rect y="238" width="400" height="3" fill="#07493e" opacity=".07" />
        {/* sunlight from the window */}
        <g className={styles.shim}>
          <path d="M36 40L148 40L330 300L150 300Z" fill="url(#signin-art-beam)" opacity=".55" />
          <ellipse cx="236" cy="270" rx="70" ry="14" fill="#fff4cf" opacity=".5" filter="url(#signin-art-ao)" />
        </g>
        {/* window */}
        <rect
          x="27"
          y="35"
          width="124"
          height="112"
          rx="16"
          fill="#07493e"
          opacity=".17"
          filter="url(#signin-art-ao)"
        />
        <rect x="24" y="28" width="122" height="106" rx="15" fill="url(#signin-art-frame)" />
        <rect x="24.8" y="28.8" width="120.4" height="104.4" rx="14.3" fill="none" stroke="#fff" strokeWidth="1.6" />
        <rect x="31" y="35" width="108" height="92" rx="9" fill="#8fc3b4" />
        <g clipPath="url(#signin-art-win)">
          <rect x="32" y="36" width="106" height="90" fill="url(#signin-art-sky)" />
          <circle cx="114" cy="58" r="22" fill="#ffd25e" opacity=".22" />
          <circle cx="114" cy="58" r="10" fill="url(#signin-art-sun)" />
          <g fill="#fff">
            <ellipse cx="58" cy="56" rx="13" ry="5.5" />
            <circle cx="54" cy="52" r="6" />
            <circle cx="62" cy="50" r="7.5" />
          </g>
          <ellipse cx="58" cy="59" rx="11" ry="2" fill="#cfe8e0" opacity=".8" />
          <path d="M32 106Q58 90 86 99T138 92V126H32Z" fill="#c6eadf" />
          <path d="M32 113Q70 102 104 109T138 105V126H32Z" fill="#a8ddca" />
          <rect x="42.8" y="100" width="2.6" height="15" rx="1.2" fill="#7a5442" />
          <circle cx="44" cy="98" r="10" fill="url(#signin-art-tree)" />
          <circle cx="51" cy="106" r="6" fill="url(#signin-art-tree)" />
          <rect x="124.8" y="101" width="2.4" height="13" rx="1.2" fill="#7a5442" />
          <circle cx="126" cy="99" r="8.5" fill="url(#signin-art-tree)" />
          <ellipse cx="84" cy="117" rx="34" ry="3" fill="#07493e" opacity=".22" filter="url(#signin-art-ao2)" />
          <rect x="58" y="86" width="52" height="31" rx="3" fill="url(#signin-art-bld)" />
          <path d="M53 88L84 69L115 88Q116 91 113 91H55Q52 91 53 88Z" fill="url(#signin-art-roof)" />
          <path d="M59 87L84 71.8" stroke="#fff" strokeOpacity=".45" strokeWidth="1.3" strokeLinecap="round" />
          <rect x="58" y="91" width="52" height="2.5" fill="#07493e" opacity=".08" />
          <circle cx="84" cy="83" r="3.7" fill="#fff" />
          <path d="M84 81.2v2l1.5 1" stroke="#07493e" strokeWidth=".8" fill="none" strokeLinecap="round" />
          <rect x="63" y="96" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="63.8" y="96.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="63" y="106" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="63.8" y="106.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="71" y="96" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="71.8" y="96.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="71" y="106" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="71.8" y="106.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="92.5" y="96" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="93.3" y="96.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="92.5" y="106" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="93.3" y="106.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="100.5" y="96" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="101.3" y="96.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="100.5" y="106" width="5.5" height="6" rx="1.4" fill="url(#signin-art-barY)" />
          <rect x="101.3" y="106.8" width="1.6" height="2.2" rx=".6" fill="#fff" opacity=".6" />
          <rect x="79.5" y="101" width="9" height="16" rx="4.5" fill="url(#signin-art-roof)" />
          <circle cx="86.2" cy="110" r=".9" fill="#ffc43d" />
          <path d="M84 69V54.5" stroke="#07493e" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M84.7 55.2q5-2.2 9 0t8.4 0v6.2q-4.2-2.2-8.4 0t-9 0z" fill="url(#signin-art-barY)" />
          <path d="M32 117Q85 111 138 117V126H32Z" fill="#8ad2ba" />
          <path d="M32 36H58L36 126H32Z" fill="#fff" opacity=".2" />
          <path d="M66 36H72L50 126H44Z" fill="#fff" opacity=".14" />
        </g>
        <rect
          x="31"
          y="35"
          width="108"
          height="92"
          rx="9"
          fill="none"
          stroke="#07493e"
          strokeOpacity=".12"
          strokeWidth="2"
        />
        <rect x="24" y="138" width="122" height="6" rx="3" fill="#07493e" opacity=".2" filter="url(#signin-art-ao2)" />
        <rect x="18" y="128" width="134" height="10" rx="5" fill="url(#signin-art-woodT)" />
        <rect x="18" y="133.5" width="134" height="4.5" rx="2.2" fill="#dcb27c" opacity=".75" />
        {/* succulent on the sill */}
        <ellipse cx="129" cy="129" rx="9" ry="2" fill="#07493e" opacity=".25" filter="url(#signin-art-ao2)" />
        <path d="M122 117h14l-1.6 11.5q-.3 1.5-2 1.5h-6.8q-1.7 0-2-1.5z" fill="url(#signin-art-mug)" />
        <rect x="121" y="115.5" width="16" height="3.6" rx="1.8" fill="#ffe08a" />
        <g fill="url(#signin-art-leafB)">
          <ellipse cx="125" cy="111" rx="3" ry="6" transform="rotate(-25 125 111)" />
          <ellipse cx="133" cy="111" rx="3" ry="6" transform="rotate(25 133 111)" />
          <ellipse cx="129" cy="109" rx="3.2" ry="7.5" />
        </g>
        {/* shelf with books */}
        <rect x="204" y="48" width="96" height="6" rx="3" fill="#07493e" opacity=".22" filter="url(#signin-art-ao2)" />
        <g>
          <rect x="206" y="17" width="9" height="24" rx="2" fill="#0b7a68" />
          <rect x="206" y="17" width="3.42" height="24" rx="1.8" fill="#fff" opacity=".25" />
          <rect x="213.2" y="18" width="1.8" height="22" rx=".9" fill="#000" opacity=".14" />
          <rect x="207.2" y="21" width="6.6" height="2" rx="1" fill="#ffc43d" opacity=".7" />
          <rect x="207.2" y="35" width="6.6" height="1.4" rx=".7" fill="#ffc43d" opacity=".5" />
        </g>
        <g>
          <rect x="216" y="21" width="8" height="20" rx="2" fill="#ffc43d" />
          <rect x="216" y="21" width="3.04" height="20" rx="1.8" fill="#fff" opacity=".25" />
          <rect x="222.2" y="22" width="1.8" height="18" rx=".9" fill="#000" opacity=".14" />
          <rect x="217.2" y="25" width="5.6" height="2" rx="1" fill="#0b7a68" opacity=".7" />
          <rect x="217.2" y="35" width="5.6" height="1.4" rx=".7" fill="#0b7a68" opacity=".5" />
        </g>
        <g>
          <rect x="225" y="14" width="10.5" height="27" rx="2" fill="#07493e" />
          <rect x="225" y="14" width="3.99" height="27" rx="1.8" fill="#fff" opacity=".25" />
          <rect x="233.7" y="15" width="1.8" height="25" rx=".9" fill="#000" opacity=".14" />
          <rect x="226.2" y="18" width="8.1" height="2" rx="1" fill="#6fd7bd" opacity=".7" />
          <rect x="226.2" y="35" width="8.1" height="1.4" rx=".7" fill="#6fd7bd" opacity=".5" />
        </g>
        <g>
          <rect x="236.5" y="23" width="7" height="18" rx="2" fill="#6fd7bd" />
          <rect x="236.5" y="23" width="2.66" height="18" rx="1.8" fill="#fff" opacity=".25" />
          <rect x="241.7" y="24" width="1.8" height="16" rx=".9" fill="#000" opacity=".14" />
          <rect x="237.7" y="27" width="4.6" height="2" rx="1" fill="#fff" opacity=".7" />
          <rect x="237.7" y="35" width="4.6" height="1.4" rx=".7" fill="#fff" opacity=".5" />
        </g>
        <g transform="rotate(-16 250 41)">
          <rect x="246" y="19" width="8" height="22" rx="2" fill="#f0a81c" />
          <rect x="246" y="19" width="3.04" height="22" rx="1.8" fill="#fff" opacity=".25" />
          <rect x="252.2" y="20" width="1.8" height="20" rx=".9" fill="#000" opacity=".14" />
          <rect x="247.2" y="23" width="5.6" height="2" rx="1" fill="#fff" opacity=".7" />
          <rect x="247.2" y="35" width="5.6" height="1.4" rx=".7" fill="#fff" opacity=".5" />
        </g>
        <ellipse cx="282" cy="41" rx="11" ry="2" fill="#07493e" opacity=".22" filter="url(#signin-art-ao2)" />
        <path d="M273 29h18l-2 10.5q-.4 2-2.4 2h-9.2q-2 0-2.4-2z" fill="url(#signin-art-pot)" />
        <g fill="url(#signin-art-leafA)">
          <circle cx="276" cy="25" r="5.5" />
          <circle cx="288" cy="25" r="5" />
        </g>
        <circle cx="282" cy="21" r="6.5" fill="url(#signin-art-leafB)" />
        <circle cx="280" cy="19" r="2" fill="#fff" opacity=".35" />
        <rect x="200" y="40" width="100" height="8" rx="4" fill="url(#signin-art-woodT)" />
        <rect x="200" y="44.5" width="100" height="3.5" rx="1.75" fill="#d9ad74" />
        {/* clock */}
        <circle cx="348.5" cy="59" r="20" fill="#07493e" opacity=".2" filter="url(#signin-art-ao)" />
        <circle cx="346" cy="54" r="20" fill="url(#signin-art-frame)" />
        <circle cx="346" cy="54" r="15.5" fill="url(#signin-art-clock)" />
        <circle cx="346" cy="54" r="15.5" fill="none" stroke="#07493e" strokeOpacity=".1" strokeWidth="1.5" />
        <line x1="346.0" y1="42.6" x2="346.0" y2="40.4" stroke="#0b7a68" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="352.3" y1="43.2" x2="352.8" y2="42.2" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <line x1="356.8" y1="47.8" x2="357.8" y2="47.2" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <line x1="357.4" y1="54.0" x2="359.6" y2="54.0" stroke="#0b7a68" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="356.8" y1="60.3" x2="357.8" y2="60.8" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <line x1="352.3" y1="64.8" x2="352.8" y2="65.8" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <line x1="346.0" y1="65.4" x2="346.0" y2="67.6" stroke="#0b7a68" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="339.8" y1="64.8" x2="339.2" y2="65.8" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <line x1="335.2" y1="60.3" x2="334.2" y2="60.8" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <line x1="334.6" y1="54.0" x2="332.4" y2="54.0" stroke="#0b7a68" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="335.2" y1="47.8" x2="334.2" y2="47.2" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <line x1="339.8" y1="43.2" x2="339.2" y2="42.2" stroke="#0b7a68" strokeWidth="1" strokeLinecap="round" />
        <path d="M346 54L346 45.5M346 54L354 57.5" stroke="#07493e" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="346" cy="54" r="2.4" fill="#ffc43d" />
        <path
          d="M332 46a15 15 0 0 1 10-6.5"
          stroke="#fff"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          opacity=".9"
        />
        {/* plant */}
        <ellipse cx="55" cy="285" rx="24" ry="4" fill="#07493e" opacity=".3" filter="url(#signin-art-ao2)" />
        <g className={styles.sway}>
          <g transform="translate(55 250) rotate(-66)">
            <path
              d="M0 0C8 -14.399999999999999 6.8 -36 0 -48C-6.8 -36 -8 -14.399999999999999 0 0Z"
              fill="url(#signin-art-leafB)"
            />
            <path
              d="M0 -3Q1.44 -24 0 -43"
              stroke="#fff"
              strokeOpacity=".35"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(55 250) rotate(-46)">
            <path d="M0 0C9.5 -19.2 8.075 -48 0 -64C-8.075 -48 -9.5 -19.2 0 0Z" fill="url(#signin-art-leafA)" />
            <path
              d="M0 -3Q1.71 -32 0 -59"
              stroke="#fff"
              strokeOpacity=".35"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(55 250) rotate(-24)">
            <path
              d="M0 0C10.5 -24 8.924999999999999 -60 0 -80C-8.924999999999999 -60 -10.5 -24 0 0Z"
              fill="url(#signin-art-leafB)"
            />
            <path
              d="M0 -3Q1.89 -40 0 -75"
              stroke="#fff"
              strokeOpacity=".35"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(55 250) rotate(-4)">
            <path d="M0 0C11 -27 9.35 -67.5 0 -90C-9.35 -67.5 -11 -27 0 0Z" fill="url(#signin-art-leafA)" />
            <path
              d="M0 -3Q1.98 -45 0 -85"
              stroke="#fff"
              strokeOpacity=".35"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(55 250) rotate(18)">
            <path
              d="M0 0C10.5 -24 8.924999999999999 -60 0 -80C-8.924999999999999 -60 -10.5 -24 0 0Z"
              fill="url(#signin-art-leafB)"
            />
            <path
              d="M0 -3Q1.89 -40 0 -75"
              stroke="#fff"
              strokeOpacity=".35"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(55 250) rotate(40)">
            <path d="M0 0C9.5 -19.8 8.075 -49.5 0 -66C-8.075 -49.5 -9.5 -19.8 0 0Z" fill="url(#signin-art-leafA)" />
            <path
              d="M0 -3Q1.71 -33 0 -61"
              stroke="#fff"
              strokeOpacity=".35"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
          <g transform="translate(55 250) rotate(60)">
            <path d="M0 0C8 -15 6.8 -37.5 0 -50C-6.8 -37.5 -8 -15 0 0Z" fill="url(#signin-art-leafB)" />
            <path
              d="M0 -3Q1.44 -25 0 -45"
              stroke="#fff"
              strokeOpacity=".35"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        </g>
        <path d="M36 247H74L70 280Q69 285 64 285H46Q41 285 40 280Z" fill="url(#signin-art-pot)" />
        <rect x="38.5" y="262" width="33" height="3" fill="#ffc43d" opacity=".9" />
        <rect x="33" y="242" width="44" height="8" rx="4" fill="#ffffff" />
        <rect x="33" y="246" width="44" height="4" rx="2" fill="#d4e4df" />
        <ellipse cx="55" cy="243" rx="18" ry="2" fill="#6b4a3a" />
        {/* chair back */}
        <rect x="136" y="112" width="68" height="96" rx="20" fill="url(#signin-art-chair)" />
        <rect x="141" y="116" width="24" height="80" rx="11" fill="#fff" opacity=".14" />
        {/* teacher (hijab), smiling, hands on the keyboard */}
        <g>
          <path d="M134 206C134 178 145 160 160 156L180 156C195 160 206 178 206 206Z" fill="url(#signin-art-cream)" />
          <path d="M134 206C134 178 145 160 157 156L161 170L154 206Z" fill="url(#signin-art-cardi)" />
          <path d="M206 206C206 178 195 160 183 156L179 170L186 206Z" fill="url(#signin-art-cardi)" />
          <path
            d="M157 156L161 170L154 206M183 156L179 170L186 206"
            stroke="#8ae6cc"
            strokeOpacity=".7"
            strokeWidth="1.2"
            fill="none"
            strokeLinejoin="round"
          />
          <path
            d="M143 184q4 9 3 20M197 184q-4 9-3 20"
            stroke="#053c33"
            strokeOpacity=".35"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M163.5 160L170 170M176.5 160L170 170" stroke="#07493e" strokeWidth="1" />
          <rect x="165.5" y="169.5" width="9" height="10.5" rx="1.8" fill="url(#signin-art-folder)" />
          <rect x="167.3" y="171.5" width="5.4" height="2.4" rx=".8" fill="#fff" />
          <ellipse cx="170" cy="166" rx="31" ry="5" fill="#07493e" opacity=".3" filter="url(#signin-art-ao2)" />
          <path
            d="M152 146C146 153 140 158 141 164C152 170.5 188 170.5 199 164C200 158 194 153 188 146Z"
            fill="#b8770a"
          />
          <path
            d="M170 100C157 100 151 109 151 122C151 133 153 140 150 146C146 152 141 156 141 161C148 167.5 192 167.5 199 161C199 156 194 152 190 146C187 140 189 133 189 122C189 109 183 100 170 100Z"
            fill="url(#signin-art-scarf)"
          />
          <path
            d="M143 160C150 166 190 166 197 160"
            stroke="#8a5806"
            strokeOpacity=".4"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            filter="url(#signin-art-ao2)"
          />
          <path
            d="M156 145Q152 153 146.5 159.5M184 145Q188 153 193.5 159.5M163.5 149Q162.5 156 160.5 164M176.5 149Q177.5 156 179.5 164"
            stroke="#a46606"
            strokeOpacity=".5"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M154.5 144.5Q150 151.5 145 156.5M161 149Q159.5 155 157.5 161"
            stroke="#fff3cf"
            strokeOpacity=".6"
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M187.5 116C189.5 128 188.5 137 186.5 143"
            stroke="#8a5806"
            strokeOpacity=".3"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M155 115Q159 104 170 103"
            stroke="#fff"
            strokeOpacity=".55"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="170" cy="124.5" rx="13.6" ry="15.6" fill="#c8860c" opacity=".55" />
          <ellipse cx="170" cy="125" rx="11.2" ry="13.2" fill="url(#signin-art-skin)" />
          <path
            d="M157 121.5Q157.5 110.5 170 110Q182.5 110.5 183 121.5Q177 115 170 115Q163 115 157 121.5Z"
            fill="url(#signin-art-scarf)"
          />
          <path
            d="M159 113Q164 111.1 169 111.1"
            stroke="#fff"
            strokeOpacity=".45"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M158.5 136Q170 146.5 181.5 136"
            stroke="#a46606"
            strokeOpacity=".6"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="165" cy="119.5" rx="4" ry="2.4" fill="#fff" opacity=".3" />
          <path
            d="M162.4 120.3q3-1.8 6-.4M171.6 119.9q3-1.4 6 .4"
            stroke="#5b3d2e"
            strokeWidth="1.05"
            fill="none"
            strokeLinecap="round"
            opacity=".8"
          />
          <ellipse cx="165.6" cy="125.5" rx="1.75" ry="2.15" fill="#2a1d17" />
          <ellipse cx="174.4" cy="125.5" rx="1.75" ry="2.15" fill="#2a1d17" />
          <circle cx="166.2" cy="124.7" r=".65" fill="#fff" />
          <circle cx="175" cy="124.7" r=".65" fill="#fff" />
          <path
            d="M163.4 123.7q2.2-1.5 4.4 0M172.2 123.7q2.2-1.5 4.4 0"
            stroke="#2a1d17"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M170.2 127.1q-1.4 3.2.8 4.2" stroke="#c48663" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          <path d="M165.2 132.9Q170 138.1 174.8 132.9Q170 134.7 165.2 132.9Z" fill="#a8473d" />
          <path
            d="M165.2 132.9Q170 138.1 174.8 132.9"
            stroke="#a8473d"
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M166.6 133.6Q170 134.7 173.4 133.6L173 134.3Q170 135.1 167 134.3Z" fill="#fff" opacity=".85" />
          <circle cx="162.2" cy="130.5" r="2.8" fill="#ff8f7a" opacity=".25" />
          <circle cx="177.8" cy="130.5" r="2.8" fill="#ff8f7a" opacity=".25" />
          <ellipse cx="170" cy="132.5" rx="12" ry="7" fill="#c9fff0" opacity=".1" />
        </g>
        {/* desk */}
        <ellipse cx="226" cy="285" rx="122" ry="6" fill="#07493e" opacity=".28" filter="url(#signin-art-ao)" />
        <rect x="124" y="212" width="202" height="48" rx="6" fill="url(#signin-art-panel)" />
        <path d="M132 236H318" stroke="#b98a52" strokeOpacity=".35" strokeWidth="1.2" />
        <rect x="120" y="210" width="10" height="75" rx="4.5" fill="url(#signin-art-woodF)" />
        <rect x="320" y="210" width="10" height="75" rx="4.5" fill="url(#signin-art-woodF)" />
        <rect x="121.5" y="212" width="3" height="70" rx="1.5" fill="#fff" opacity=".25" />
        <rect x="321.5" y="212" width="3" height="70" rx="1.5" fill="#fff" opacity=".25" />
        <path d="M118 197H332Q338 197 340 204H110Q112 197 118 197Z" fill="url(#signin-art-woodT)" />
        <rect x="110" y="203" width="230" height="12" rx="6" fill="url(#signin-art-woodF)" />
        <path d="M115 203.7H335" stroke="#fff" strokeOpacity=".75" strokeWidth="1.1" strokeLinecap="round" />
        {/* laptop: base, her hands on the keys, then the back of the lid */}
        <ellipse cx="171" cy="203" rx="32" ry="2.5" fill="#07493e" opacity=".3" filter="url(#signin-art-ao2)" />
        <rect x="140" y="198.5" width="60" height="4.6" rx="2.2" fill="#b4ccc5" />
        <rect x="142" y="198.6" width="56" height="1.3" rx=".6" fill="#fff" opacity=".7" />
        <path
          d="M141 168C133 180 135 194 150 197.5"
          stroke="url(#signin-art-cardi)"
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M199 168C207 180 205 194 190 197.5"
          stroke="url(#signin-art-cardi)"
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M140.5 170C135 179 135 189 141 195"
          stroke="#fff"
          strokeOpacity=".22"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="153" cy="197" rx="5.6" ry="3.4" fill="url(#signin-art-skin)" />
        <ellipse cx="187" cy="197" rx="5.6" ry="3.4" fill="url(#signin-art-skin)" />
        <path
          d="M155 195.6h3.4M155 197.6h3.6M185 195.6h-3.4M185 197.6h-3.6"
          stroke="#c48663"
          strokeWidth=".8"
          strokeLinecap="round"
        />
        <rect x="151" y="183" width="38" height="19" rx="5" fill="url(#signin-art-lid)" />
        <rect x="151.7" y="183.7" width="36.6" height="17.6" rx="4.4" fill="none" stroke="#fff" strokeWidth="1.3" />
        <path d="M170 189.2l6 3-6 3-6-3z" fill="#9ccfc0" />
        <path d="M166 193.6v2.4q4 2.6 8 0v-2.4" stroke="#9ccfc0" strokeWidth="1.3" fill="none" />
        {/* monitor */}
        <ellipse cx="271" cy="200" rx="28" ry="2.6" fill="#07493e" opacity=".3" filter="url(#signin-art-ao2)" />
        <path d="M265 184h12l2 13h-16z" fill="url(#signin-art-frame)" />
        <rect x="249" y="195.5" width="44" height="5" rx="2.5" fill="url(#signin-art-frame)" />
        <rect
          x="214"
          y="113"
          width="120"
          height="78"
          rx="10"
          fill="#07493e"
          opacity=".25"
          filter="url(#signin-art-ao)"
        />
        <rect x="212" y="108" width="120" height="78" rx="10" fill="url(#signin-art-dark)" />
        <rect
          x="212.7"
          y="108.7"
          width="118.6"
          height="76.6"
          rx="9.4"
          fill="none"
          stroke="#fff"
          strokeOpacity=".18"
          strokeWidth="1.3"
        />
        <rect x="217" y="113" width="110" height="65" rx="5" fill="url(#signin-art-scr)" />
        <path d="M217 118a5 5 0 0 1 5-5h100a5 5 0 0 1 5 5v5H217z" fill="#0b7a68" />
        <circle cx="223" cy="118" r="1.6" fill="#fff" opacity=".7" />
        <circle cx="228" cy="118" r="1.6" fill="#fff" opacity=".7" />
        <circle cx="233" cy="118" r="1.6" fill="#ffc43d" />
        <rect x="290" y="116.5" width="30" height="3" rx="1.5" fill="#fff" opacity=".55" />
        <rect x="223" y="128" width="30" height="3.6" rx="1.8" fill="#11302b" opacity=".75" />
        <rect x="223" y="134" width="20" height="3" rx="1.5" fill="#cde9e1" />
        <path d="M222 172.5H290" stroke="#d5efe8" strokeWidth="1" />
        <rect
          className={styles.bar}
          style={{ animationDelay: '0.40s' }}
          x="225"
          y="159"
          width="7"
          height="13"
          rx="2"
          fill="url(#signin-art-barT)"
        />
        <rect
          className={styles.bar}
          style={{ animationDelay: '0.50s' }}
          x="236.5"
          y="151"
          width="7"
          height="21"
          rx="2"
          fill="url(#signin-art-barT)"
        />
        <rect
          className={styles.bar}
          style={{ animationDelay: '0.60s' }}
          x="248"
          y="155"
          width="7"
          height="17"
          rx="2"
          fill="url(#signin-art-barT)"
        />
        <rect
          className={styles.bar}
          style={{ animationDelay: '0.70s' }}
          x="259.5"
          y="143"
          width="7"
          height="29"
          rx="2"
          fill="url(#signin-art-barY)"
        />
        <rect
          className={styles.bar}
          style={{ animationDelay: '0.80s' }}
          x="271"
          y="148"
          width="7"
          height="24"
          rx="2"
          fill="url(#signin-art-barT)"
        />
        <rect
          className={styles.bar}
          style={{ animationDelay: '0.90s' }}
          x="282.5"
          y="139"
          width="7"
          height="33"
          rx="2"
          fill="url(#signin-art-barT)"
        />
        <circle cx="307" cy="144" r="11" fill="none" stroke="#dcefe9" strokeWidth="5" />
        <circle
          cx="307"
          cy="144"
          r="11"
          fill="none"
          stroke="url(#signin-art-barT)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="50 70"
          transform="rotate(-90 307 144)"
        />
        <text x="307" y="146.4" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#11302b" direction="ltr">
          {'72%'}
        </text>
        <rect x="297" y="161" width="20" height="3" rx="1.5" fill="#cde9e1" />
        <rect x="297" y="166.5" width="13" height="3" rx="1.5" fill="#cde9e1" />
        <circle cx="272" cy="182" r="1.3" fill="#fff" opacity=".35" />
        <g transform="translate(186 0)">
          {/* mug with steam */}
          <ellipse cx="125" cy="199" rx="10" ry="2.2" fill="#07493e" opacity=".28" filter="url(#signin-art-ao2)" />
          <path d="M129 187q7-.5 7 5t-7 5" stroke="#e99f15" strokeWidth="2.6" fill="none" />
          <rect x="117" y="184" width="13" height="15" rx="3.5" fill="url(#signin-art-mug)" />
          <ellipse cx="123.5" cy="184.6" rx="6.2" ry="1.7" fill="#7a4a24" />
          <rect x="118.5" y="187" width="2.4" height="9" rx="1.2" fill="#fff" opacity=".45" />
          <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" opacity=".5">
            <path className={styles.steam} d="M121 179q-3-4 0-8t0-8" />
            <path className={styles.steam} style={{ animationDelay: '1.3s' }} d="M126 180q-3-4 0-8t0-8" />
          </g>
        </g>
        {/* colleague, pointing */}
        <g>
          <ellipse cx="361" cy="285" rx="24" ry="3.6" fill="#07493e" opacity=".32" filter="url(#signin-art-ao2)" />
          <path d="M349 214L347 279Q347 281 349.5 281H357.5L360 224Z" fill="url(#signin-art-pants)" />
          <path d="M360 224L363.5 281H371.5Q374 281 374 279L373.5 214Z" fill="url(#signin-art-pants)" />
          <path d="M352 222l-.8 52M366 226l1.4 50" stroke="#fff" strokeOpacity=".1" strokeWidth="1.2" />
          <path d="M343.5 279.5q0-3.2 3.4-3.2h11.6v6.7h-15z" fill="#0d211d" />
          <path d="M346 277.5h8" stroke="#fff" strokeOpacity=".25" strokeWidth="1" strokeLinecap="round" />
          <path d="M362.5 276.3h11.6q3.6 0 3.6 3.2v3.5h-15.2z" fill="#0d211d" />
          <path d="M377 158Q384 174 381.5 196" stroke="#1d9a7e" strokeWidth="8.5" strokeLinecap="round" fill="none" />
          <rect
            x="371"
            y="184"
            width="18"
            height="24"
            rx="2.5"
            fill="url(#signin-art-folder)"
            transform="rotate(8 380 196)"
          />
          <rect x="373" y="186" width="14" height="3" rx="1" fill="#fff" opacity=".8" transform="rotate(8 380 196)" />
          <path
            d="M346 160Q347 150 356 148L368 148Q377 150 378 160L376.5 216Q362 221 347.5 216Z"
            fill="url(#signin-art-shirt)"
          />
          <path
            d="M353 188q4 11 1.5 26M371 184q-2 12 0 30"
            stroke="#0d7d66"
            strokeOpacity=".3"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="347" y="211.5" width="30" height="4.5" rx="2" fill="#0d211d" />
          <rect x="360" y="211.8" width="5" height="3.9" rx="1" fill="#ffc43d" />
          <path d="M356 148L362 158L368 148Z" fill="#e9f7f3" />
          <path d="M357 148l5 7.5 5-7.5" fill="none" stroke="#0d7d66" strokeOpacity=".4" strokeWidth="1" />
          <path d="M358 150L364 172M366 150L364 172" stroke="#07493e" strokeWidth="1" opacity=".8" />
          <rect x="360" y="171" width="8.5" height="11" rx="1.8" fill="url(#signin-art-folder)" />
          <rect x="361.8" y="173" width="5" height="2.4" rx=".8" fill="#fff" />
          <circle cx="381.5" cy="198" r="3.6" fill="url(#signin-art-skin2)" />
          <path d="M350 157Q339 159 332.5 153" stroke="#36b896" strokeWidth="8.5" strokeLinecap="round" fill="none" />
          <path d="M332.5 153L322 146" stroke="url(#signin-art-skin2)" strokeWidth="5.4" strokeLinecap="round" />
          <path d="M323 146.5L315 140.5" stroke="#d9a079" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="321.5" cy="145.5" r="3.4" fill="#d9a079" />
          <rect x="356.5" y="138" width="10" height="12" rx="3.5" fill="#c98d64" />
          <circle cx="361" cy="128" r="13.5" fill="url(#signin-art-skin2)" />
          <ellipse cx="373.5" cy="130" rx="2.8" ry="3.8" fill="#d59a72" />
          <path d="M373.5 128.5q1.5 1.5 0 3" stroke="#a96f4a" strokeWidth=".9" fill="none" />
          <path
            d="M347.6 126.5C346 113.5 356 109.5 363 110C372.5 110.5 377.5 118 375.5 129C374.5 124 371.5 121 366 120.5C360 122.5 352 122 347.6 126.5Z"
            fill="url(#signin-art-hair)"
          />
          <path
            d="M353.5 115q6-3.4 12.5-1.4"
            stroke="#9c7a62"
            strokeOpacity=".65"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M349 133q2.5 7 9 8.5q6 .5 10-3.5"
            stroke="#8a5a3a"
            strokeOpacity=".18"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M349.5 124.6q2.6-1.4 5 0M357.5 124.4q2.6-1.4 5 .2"
            stroke="#2a1d17"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="352" cy="129" rx="1.4" ry="1.8" fill="#1f1611" />
          <ellipse cx="360" cy="129" rx="1.4" ry="1.8" fill="#1f1611" />
          <circle cx="352.5" cy="128.4" r=".5" fill="#fff" />
          <circle cx="360.5" cy="128.4" r=".5" fill="#fff" />
          <path d="M349.4 131q-2.2 3 .6 4.2" stroke="#a96f4a" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          <path d="M352 137.4q3.4 2.4 7 0" stroke="#8c4a3c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="364" cy="134" r="2.6" fill="#ff8f7a" opacity=".2" />
          <ellipse cx="355" cy="122.8" rx="4" ry="1.6" fill="#fff" opacity=".18" />
        </g>
        {/* floating cards */}
        {/* floating cards */}
        <FloatingCard
          x={168}
          y={56}
          w={138}
          h={40}
          rtl={rtl}
          title={copy.payroll}
          detail={copy.payrollDetail}
          icon={checkIcon}
          delay={0.6}
        />
        <FloatingCard
          x={10}
          y={154}
          w={120}
          h={40}
          rtl={rtl}
          title={copy.attendance}
          detail={copy.attendanceDetail}
          icon={userIcon}
          delay={1.4}
        />
      </svg>
    </div>
  );
}
