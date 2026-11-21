# Design — direction "Campus"

The direction, not the values. Every value (colour, radius, shadow, curve) lives once in
`apps/web/src/app/globals.css`; this file says what each one is for. The reference mockup is
`design/mockups/b-campus.html` (local, not committed).

## Feel

**Warm, friendly, optimistic, orderly.** A school, not a bank. Staff open it every day to do
careful work with money and people, so it is calm and legible first; the warmth comes from the
palette and the rounded shapes, never from decoration that slows the work down.

## Theme

**Light only.** No dark tokens and no theme toggle (CLAUDE.md overrides the skill). Every
text/background pair is checked for WCAG AA on the light surfaces.

## Colour roles

| Token | Role |
|---|---|
| `background` | The page behind the cards: a pale teal-tinted grey. |
| `card` | Every surface that holds content: tables, tiles, dialogs, the sidebar. White. |
| `muted` | Quiet fills inside a card: table header, card fields, form-switch rows. |
| `secondary` | Neutral pills, skeletons, the language switch track. |
| `primary` (teal) | The one main action on a view, the current menu item, links, focus rings, the selected day. Also the one **feature tile** per screen (the answer: net to pay, headcount). |
| `primary-soft` | Selected/active backgrounds, the highlight band on a card (net pay), row hover. |
| `accent` (sunflower) | The single warm highlight: the active-item dot, the selected language, the circle on the feature tile. Never a button, never body text. Text on it uses `accent-foreground`. |
| `accent-soft` | "Draft" and other in-progress statuses. |
| `success` / `-soft` / `-ink` | Done, ready, approved. |
| `warning` / `-soft` / `-ink` | Needs a look: pending penalties, a row to review (also the inline-start bar on that row). |
| `destructive` / `-soft` / `-ink` | Blocking errors, cancel/deactivate confirmations, penalty amounts. |
| `info` / `-soft` / `-ink` | Counts and neutral facts (employees tile). |
| `border` / `input` | Hairlines between rows; control outlines. |
| `overlay` | The dim behind dialogs and the drawer. |

`*-ink` tokens are the darker text shades used on their `*-soft` fills (pills, icon chips); the
plain status colour is for icons, bars and large figures only.

## Type

- **Plus Jakarta Sans** — Latin text and **every figure** (`tabular` utility: Latin digits,
  tabular, lining), in both languages, so amounts line up and read the same on every screen.
- **IBM Plex Sans Arabic** — Arabic body text.
- **Tajawal** — Arabic headings (`font-display`); Latin headings stay in Plus Jakarta Sans,
  extra-bold.
- At most three or four sizes per screen. Hierarchy from size, weight and colour together.
- Numbers are always Latin digits, grouped with commas. Money is integer piastres from the API and
  is shown only through `<Money>` / `formatMoney` (`EGP 14,000.00`; `14,000.00 ج.م`, the label to
  the left of the figure in both languages). Day counts through `<Days>` / `formatDays` (`1.25`).
- **Dates and times:** every time of day is 12-hour with the period, never 24-hour — `4:07 PM`,
  Arabic `4:07 م` / `9:30 ص`; midnight `12:00 AM`, noon `12:00 PM`; no leading zero on the hour; a
  no-break space before the period. On the school's clock (Cairo). Only through `formatTime`,
  `formatDateTime` (`17 Nov 2026, 4:07 PM`) and `formatTimeOfDay` in `shared/lib/format.ts`
  (owner, 2026-11-21); never `toLocaleTimeString` or a hand-built `HH:mm`.

## Shape and space

- Rounded and soft: cards and tiles use the large radius, controls and buttons the base radius,
  pills are fully round. Bigger things are rounder.
- One small set of shadows: `card` for resting surfaces, `raised` for dialogs, popovers and the
  drawer, `primary` under the main button only.
- Spacing on Tailwind's scale; related things sit closer than unrelated ones.

## Layout

- **≥1280px:** sidebar with labels. **768–1279px:** icon rail (labels for screen readers and as
  tooltips). **<768px:** top bar with the school name, a menu button and the language switch; the
  menu is a drawer from the inline-start edge.
- **Tables follow their container, not the window:** a table at 740px of container width and up,
  stacked cards below (name and status on top, the key amount as a teal band, the rest as a
  label/value grid).
- **Every table row runs edge to edge of its card**, both directions: the header band, row hover,
  hairlines and a totals row meet the card's inner edge. A table's scroller reserves no scrollbar
  gutter (it only ever scrolls sideways; a real scrollbar takes its own space under the rows).
- **A totals row is part of the table** (`DataTable`'s `footer`): a subtotal or total sits under
  its own columns on a `muted` row with a heavier top rule, the label in the first column; on a
  phone it is one more card after the cards, on `muted`, with the key amount as the teal band. When
  the viewer may not see the totals, one muted note spans the columns instead. Never a hand-drawn
  `<tfoot>` or a total line outside the table. On a paged list it is the
  total of the whole list, not the page, and its label says so ("Subtotal · all 26").
- **A paged list that prints lists everyone** (`DataTable`'s `printRows`): the screen shows the page,
  the printout every row with the totals, without the pagination or the search.
- English is the default language; Arabic is fully mirrored. Logical classes only; chevrons flip with `flip-rtl`.
- No horizontal scroll at 375px in either language.
- **The notification bell** (§11) sits beside the language switch on every width, its unread
  count a sunflower badge. Its list is a popover anchored to the bell (about 430px, `raised`
  shadow, the body scrolls) from 768px, and the whole screen below it. Unread rows sit on a
  `primary-soft` tint with a sunflower dot; done rows are dimmed with their "Approved by …" in
  `success-ink`. Each kind's icon chip takes its role's soft tone (penalties `warning`, payroll
  `primary`, employee reminders `info`, lateness `accent-soft`).

## Icons

Phosphor, **duotone**, imported only from `src/shared/components/ui/icons.tsx` — never from the
package and never lucide. Directional icons (chevrons) flip in Arabic.

## Motion

Motion explains a change and never delays it.

- Hover and colour changes 150ms; dialogs and the drawer ~200–250ms in, 150ms out; popovers grow
  from their trigger. Curves are the shared `ease-snappy` / `ease-drawer` tokens; never `ease-in`.
- Transform and opacity only. The drawer slides from the inline-start edge (mirrored in Arabic).
- Buttons press to 98%. Skeletons pulse slowly; refetched tables dim instead of flashing back to
  skeletons; while they refetch, the list's search box swaps its magnifier for a small spinner
  (below). Reduced motion turns pulses and slides into plain fades, and the spinner stands still.
- No motion on actions done many times a day (paging, typing, saving rows).

## States

- **Loading:** skeletons in the exact shape of what comes (same row count as the page). Spinners
  appear in two places only: inside a button that is mid-submit, and in a list's search box while
  that list refetches (typing, a filter, a tab, a page; owner, 2026-11-20). The search one is
  `SearchInput loading`: it replaces the magnifier in place after ~180ms, stays at least ~300ms,
  announces "Loading…" once, and the rows still dim. Filters get no spinner of their own.
- **Empty:** says what is missing and offers the action that fills it. "No results for these
  filters" is a different message from "nothing yet".
- **Error:** says what happened and offers a retry; never a blank area.
- **Confirmations:** destructive or irreversible actions go through `ConfirmDialog`; cancelling a
  penalty or deactivating someone requires a reason.
- **Toasts:** the shared `Toaster` only — a `card` surface with the `raised` shadow, the tone icon
  in a soft round badge (success, destructive, warning; info in primary-soft), the title in the
  display face, a close button; top inline-end corner (top-right in English, top-left in Arabic),
  under the top bar, stacked with gaps (owner, 2026-11-19: keep top right). Always in the screen's
  language (pass a translated `successMessage`, never the API's English).
- **Avatars:** one avatar for every person, never initials (owner, 2026-11-18; 2026-11-19) —
  `PersonAvatar`. An employee shows their photo, else the male or female silhouette by gender; a
  user account shows its linked employee's (the API sends `employee.photoUrl` / `gender` on users,
  the session and Activity's people), else a neutral silhouette. No photo: a white figure on the
  `avatar-tile` grey. Inactive people are greyed (photo in grayscale).
- **Take away / give back:** Deactivate is a destructive outline (red in ⋯ menus), Reactivate a
  soft success button (green in ⋯ menus) — `StatusChangeButton`, different icons, never the same
  neutral button with different words.

## Avoid

- Dark mode, gradients as decoration, more than one feature tile per screen.
- Sunflower on buttons or as text colour; red for anything that isn't an error or a deduction.
- Raw colours or hex in components, physical direction classes, native selects/date inputs.
- Arabic-Indic digits, ungrouped amounts, floats for money.
- A hand-written `<table>`, dialog, field or empty state in a page — the shared ones own the look.
- Centered page spinners, motion over ~300ms, hover effects that stick on touch.
