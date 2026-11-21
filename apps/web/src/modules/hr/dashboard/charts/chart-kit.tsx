'use client';

import type { Month } from '@school-erp/shared';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { formatMonth, formatMonthShort } from '@/shared/lib/format';
import type { Locale } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/*
 * Small inline-SVG charts for the dashboard (dataviz method: thin marks, 4px rounded data ends on
 * the baseline, a 2px gap between stacked segments, recessive grid, one y axis, a hover and focus
 * tooltip on every month). No chart library: the API sends every figure, these only draw them.
 *
 * Arabic: time runs right to left (newest month on the left) and the y axis sits on the right.
 * The SVG keeps LTR coordinates and mirrors the positions itself.
 */

/**
 * An element's size, measured after mount and on every resize (0 × 0 before the first one). The
 * element's CSS sets it (`h-[150px] md:h-[200px]`), so the server's paint and the skeleton already
 * have the chart's height; the marks are drawn once it is known.
 */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

let canvas: CanvasRenderingContext2D | null | undefined;
/** A label's width in px in the page's own font (for the y-axis gutter and label spacing). */
export function textWidth(text: string, size = 11.5, weight = 600): number {
  if (canvas === undefined) canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!canvas) return text.length * size * 0.6;
  canvas.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
  return canvas.measureText(text).width;
}

/** A round step for `range / ticks` (1, 2, 2.5 or 5 × a power of ten). */
export function niceStep(x: number): number {
  if (x <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

/** Rounded top (a column's data end), square bottom on the baseline. */
const roundTop = (x: number, yt: number, w: number, yb: number, r = 4) => {
  r = Math.max(0, Math.min(r, w / 2, yb - yt));
  return `M${x},${yb}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + w - r}Q${x + w},${yt} ${x + w},${yt + r}V${yb}Z`;
};
/** Rounded bottom (a column below zero). */
const roundBottom = (x: number, yt: number, w: number, yb: number, r = 4) => {
  r = Math.max(0, Math.min(r, w / 2, yb - yt));
  return `M${x},${yt}H${x + w}V${yb - r}Q${x + w},${yb} ${x + w - r},${yb}H${x + r}Q${x},${yb} ${x},${yb - r}Z`;
};
const square = (x: number, yt: number, w: number, yb: number) => `M${x},${yt}H${x + w}V${yb}H${x}Z`;

export interface TooltipRow {
  /** The series' swatch colour (a CSS colour, e.g. `var(--series-1)`); none for a total. */
  color?: string;
  label: string;
  value: string;
}
export interface TooltipContent {
  title: string;
  rows: TooltipRow[];
}

/**
 * The floating box of one month's figures: inside the plot, beside the month (to its left when the
 * month is in the right half, else to its right), so it never covers the month it describes or the
 * card's header above.
 */
function ChartTooltip({ content, x, slot, width, top, id }: { content: TooltipContent; x: number; slot: number; width: number; top: number; id: string }) {
  const boxWidth = Math.min(232, width - 8);
  const gap = Math.max(slot / 2, 6) + 6;
  const wanted = x > width / 2 ? x - gap - boxWidth : x + gap;
  const left = Math.max(0, Math.min(width - boxWidth, wanted));
  return (
    <div
      id={id}
      role="tooltip"
      // Physical `left` on purpose: `x` is the SVG's own (LTR) coordinate.
      style={{ left, top, width: boxWidth }}
      className="pointer-events-none absolute z-10 rounded-xl bg-popover px-3 py-2 text-xs shadow-raised ring-1 ring-border"
    >
      <div className="mb-1 font-extrabold">{content.title}</div>
      {content.rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 leading-6">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: row.color ?? 'transparent' }} />
          <span className="min-w-0 flex-1 text-muted-foreground">{row.label}</span>
          <bdi dir="ltr" className="tabular font-bold">
            {row.value}
          </bdi>
        </div>
      ))}
    </div>
  );
}

/**
 * Which month is pointed at or focused: hover sets it, the arrow keys move it (visually: in Arabic
 * the left arrow goes to a newer month), Home / End jump to the ends, leaving clears it.
 */
function useActiveMonth(count: number, rtl: boolean) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const step = (d: number) => {
        e.preventDefault();
        setActive((a) => Math.max(0, Math.min(count - 1, (a ?? count - 1) + d)));
      };
      if (e.key === 'ArrowRight') step(rtl ? -1 : 1);
      else if (e.key === 'ArrowLeft') step(rtl ? 1 : -1);
      else if (e.key === 'Home') {
        e.preventDefault();
        setActive(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActive(count - 1);
      } else if (e.key === 'Escape') setActive(null);
    },
    [count, rtl],
  );
  return { active, setActive, onKeyDown };
}

interface TimeFrame {
  width: number;
  x0: number;
  x1: number;
  slot: number;
  padT: number;
  plotH: number;
  y: (v: number) => number;
  cx: (k: number) => number;
}

interface TimeChartShell {
  months: Month[];
  locale: Locale;
  /** The chart's height, as classes (it may differ per breakpoint). */
  heightClass: string;
  /** Axis ticks from −bottom to top, every `step`. */
  top: number;
  bottom: number;
  step: number;
  yFormat: (v: number) => string;
  ariaLabel: string;
  hint: string;
  tooltip: (k: number) => TooltipContent;
  padTop?: number;
  marks: (f: TimeFrame, active: number | null) => ReactNode;
}

/** The shared frame of the time charts: grid, y labels, month labels, hover and focus. */
function TimeChart({ months, locale, heightClass, top, bottom, step, yFormat, ariaLabel, hint, tooltip, padTop = 22, marks }: TimeChartShell) {
  const [ref, { width, height }] = useElementSize<HTMLDivElement>();
  const rtl = locale === 'ar';
  const n = months.length;
  const { active, setActive, onKeyDown } = useActiveMonth(n, rtl);
  const tipId = useId();
  const hintId = useId();

  let content: ReactNode = null;
  let frame: TimeFrame | null = null;
  if (width > 0 && height > 0) {
    const ticks: number[] = [];
    for (let v = -bottom; v <= top + 1e-9; v += step) ticks.push(+v.toFixed(6));
    const gutter = Math.max(...ticks.map((t) => textWidth(yFormat(t), 11, 500))) + 10;
    const padB = 34;
    const x0 = rtl ? 2 : gutter;
    const x1 = rtl ? width - gutter : width - 2;
    const plotH = height - padTop - padB;
    const span = top + bottom || 1;
    const y = (v: number) => padTop + ((top - v) / span) * plotH;
    const slot = (x1 - x0) / n;
    const cx = (k: number) => x0 + ((rtl ? n - 1 - k : k) + 0.5) * slot;
    frame = { width, x0, x1, slot, padT: padTop, plotH, y, cx };

    // Month labels: the newest always, then every k-th going back so they never touch.
    const labelOf = (m: Month) => formatMonthShort(m, locale);
    const maxW = Math.max(...months.map((m) => textWidth(labelOf(m))));
    const every = Math.max(1, Math.ceil((maxW + 10) / slot));
    const labelled = (k: number) => (n - 1 - k) % every === 0;
    // The year under the first labelled month, and under each labelled month whose year changed.
    const firstLabelled = months.findIndex((_, k) => labelled(k));
    const prevLabelled = (k: number) => k - every;
    const xLabels = months.map((m, k) => {
      if (!labelled(k)) return null;
      const year = m.slice(0, 4);
      const showYear = k === firstLabelled || months[prevLabelled(k)]?.slice(0, 4) !== year;
      const by = padTop + plotH + 16;
      const newest = k === n - 1;
      return (
        <g key={m}>
          <text x={cx(k)} y={by} textAnchor="middle" fontSize="11.5" fontWeight={newest ? 700 : 600} className={newest ? 'fill-foreground' : 'fill-muted-foreground'}>
            {labelOf(m)}
          </text>
          {showYear ? (
            <text x={cx(k)} y={by + 13} textAnchor="middle" fontSize="10.5" fontWeight="500" className="tabular fill-muted-foreground" opacity={0.8}>
              {year}
            </text>
          ) : null}
        </g>
      );
    });

    content = (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block overflow-visible" direction="ltr">
        {ticks.map((t) => {
          const yy = y(t);
          return (
            <g key={t}>
              <line x1={x0} x2={x1} y1={yy} y2={yy} strokeWidth={1} className={t === 0 ? 'stroke-chart-axis' : 'stroke-chart-grid'} />
              <text x={rtl ? x1 + 8 : x0 - 8} y={yy + 4} textAnchor={rtl ? 'start' : 'end'} fontSize="11" fontWeight="500" className="tabular fill-muted-foreground">
                {yFormat(t)}
              </text>
            </g>
          );
        })}
        {active !== null ? (
          <rect x={cx(active) - slot / 2} y={padTop - 6} width={slot} height={plotH + 6} rx={6} className="fill-primary/6" />
        ) : null}
        {marks(frame, active)}
        {xLabels}
        {months.map((m, k) => (
          <rect
            key={m}
            x={cx(k) - slot / 2}
            y={padTop - 6}
            width={slot}
            height={plotH + 6}
            fill="transparent"
            onPointerEnter={() => setActive(k)}
          />
        ))}
      </svg>
    );
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={ariaLabel}
      aria-describedby={active !== null ? tipId : hintId}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((a) => a ?? n - 1)}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
      className={cn(
        'relative w-full rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
        heightClass,
      )}
    >
      <span id={hintId} className="sr-only">
        {hint}
      </span>
      {content}
      {frame && active !== null ? (
        <ChartTooltip id={tipId} content={tooltip(active)} x={frame.cx(active)} slot={frame.slot} width={frame.width} top={Math.max(0, frame.padT - 8)} />
      ) : null}
    </div>
  );
}

export interface BarSeries {
  /** One value per month (null or 0: nothing drawn). */
  values: (number | null)[];
  /** A CSS colour, or one per month (the current month in full teal, the past pale). */
  color: string | ((k: number) => string);
}

/**
 * Columns per month: `above` stacked over zero, `below` stacked under it (leavers). A 2px gap
 * between stacked segments; only the outer end is rounded.
 */
export function TimeBarChart({
  above,
  below = [],
  cap,
  ticks = 4,
  step: fixedStep,
  ...shell
}: Omit<TimeChartShell, 'top' | 'bottom' | 'step' | 'marks'> & {
  above: BarSeries[];
  below?: BarSeries[];
  /** A value printed over (or under) one month's column. */
  cap?: { index: number; text: string; below?: boolean };
  ticks?: number;
  step?: number;
}) {
  const n = shell.months.length;
  const sumAt = (series: BarSeries[], k: number) => series.reduce((s, se) => s + (se.values[k] ?? 0), 0);
  const maxP = Math.max(0, ...Array.from({ length: n }, (_, k) => sumAt(above, k)));
  const maxN = Math.max(0, ...Array.from({ length: n }, (_, k) => sumAt(below, k)));
  const step = fixedStep ?? niceStep((maxP + maxN) / ticks || 1);
  const top = Math.max(step, Math.ceil(maxP / step) * step);
  const bottom = Math.ceil(maxN / step) * step;
  return (
    <TimeChart
      {...shell}
      top={top}
      bottom={bottom}
      step={step}
      marks={(f) => {
        const bw = Math.min(24, f.slot * 0.58);
        const paths: ReactNode[] = [];
        for (let k = 0; k < n; k++) {
          const X = f.cx(k) - bw / 2;
          const nonZero = above.map((se) => (se.values[k] ?? 0) > 0);
          const lastNZ = nonZero.lastIndexOf(true);
          let acc = 0;
          above.forEach((se, si) => {
            const v = se.values[k] ?? 0;
            if (v <= 0) return;
            let yb = f.y(acc);
            const yt = f.y(acc + v);
            if (acc > 0) yb -= 2;
            acc += v;
            const color = typeof se.color === 'function' ? se.color(k) : se.color;
            paths.push(<path key={`a${k}-${si}`} d={si === lastNZ ? roundTop(X, yt, bw, yb) : square(X, yt, bw, yb)} fill={color} />);
          });
          let accN = 0;
          below.forEach((se, si) => {
            const v = se.values[k] ?? 0;
            if (v <= 0) return;
            const yt = f.y(-accN) + (accN > 0 ? 2 : 0);
            const yb = f.y(-(accN + v));
            accN += v;
            const color = typeof se.color === 'function' ? se.color(k) : se.color;
            paths.push(<path key={`b${k}-${si}`} d={roundBottom(X, yt, bw, yb)} fill={color} />);
          });
        }
        if (cap) {
          const k = cap.index;
          const v = cap.below ? -sumAt(below, k) : sumAt(above, k);
          const yy = cap.below ? f.y(v) + 15 : f.y(v) - 7;
          // Kept inside the plot: the newest column sits at its edge, so the label hugs the column.
          const w = textWidth(cap.text, 11.5, 700);
          const x = Math.max(f.x0 + w / 2, Math.min(f.x1 - w / 2, f.cx(k)));
          paths.push(
            <text key="cap" x={x} y={yy} textAnchor="middle" fontSize="11.5" fontWeight="700" className="tabular fill-foreground">
              {cap.text}
            </text>,
          );
        }
        return paths;
      }}
    />
  );
}

/** One line over the months (2px), its area washed in, the newest point marked and labelled. */
export function TimeLineChart({
  values,
  color,
  endText,
  ticks = 2,
  ...shell
}: Omit<TimeChartShell, 'top' | 'bottom' | 'step' | 'marks'> & {
  values: number[];
  color: string;
  endText: string;
  ticks?: number;
}) {
  const max = Math.max(0, ...values);
  const step = niceStep(max / ticks || 1);
  const top = Math.max(step, Math.ceil(max / step) * step);
  return (
    <TimeChart
      {...shell}
      top={top}
      bottom={0}
      step={step}
      marks={(f, active) => {
        const pts = values.map((v, k) => [f.cx(k), f.y(v)] as const);
        if (!pts.length) return null;
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
        // The area closes on the baseline below the first and last points (either side in RTL).
        const area = `${line}L${pts[pts.length - 1]![0].toFixed(1)},${f.y(0)}L${pts[0]![0].toFixed(1)},${f.y(0)}Z`;
        const last = pts[pts.length - 1]!;
        const w = textWidth(endText, 11.5, 700);
        const lx = Math.max(f.x0 + w / 2, Math.min(f.x1 - w / 2, last[0]));
        return (
          <>
            <path d={area} fill={color} opacity={0.1} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={last[0]} cy={last[1]} r={4.5} fill={color} className="stroke-card" strokeWidth={2} />
            <text x={lx} y={last[1] - 10} textAnchor="middle" fontSize="11.5" fontWeight="700" className="tabular fill-foreground">
              {endText}
            </text>
            {active !== null ? (
              <>
                <line x1={pts[active]![0]} x2={pts[active]![0]} y1={f.padT} y2={f.y(0)} className="stroke-chart-axis" />
                <circle cx={pts[active]![0]} cy={pts[active]![1]} r={4.5} fill={color} className="stroke-card" strokeWidth={2} />
              </>
            ) : null}
          </>
        );
      }}
    />
  );
}

/** A month as the tooltip's and the table's title: `November 2026` / `نوفمبر 2026`. */
export const monthTitle = (m: Month, locale: Locale) => formatMonth(m, locale);

/** The legend: a swatch (or a short line for a line series) and its name per series. */
export function ChartLegend({ items, className }: { items: { color: string; label: string; line?: boolean }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-muted-foreground', className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('inline-block rounded-[3px]', item.line ? 'h-[3px] w-3.5' : 'size-2.5')} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** The same numbers as an accessible table (a chart card's Table view). */
export function ChartTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="scrollbar-clean max-h-75 overflow-auto rounded-lg">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn('sticky top-0 bg-muted px-2 py-1.5 text-xs font-semibold text-muted-foreground', i ? 'text-end' : 'text-start')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-border last:border-0">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-2 py-1.5 text-start font-medium">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="tabular px-2 py-1.5 text-end">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
