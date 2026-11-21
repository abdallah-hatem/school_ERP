/**
 * Motion for a tab, a section list item or a segment of a switch: give it to the items that are
 * NOT the current one, never to the current one.
 *
 * The current marker (underline, tint, card) moves in the frame of the click — no colour fade.
 * A `transition-colors` on every item cross-faded the old and the new marker for 150ms, so right
 * after a click the new content sat under the old tab's full highlight and both looked half
 * picked (owner, 2026-11-21: "the highlight goes back to the tab I left, then returns"). The fade
 * only runs while the pointer is over an item (`hover:`), so hovering still eases in, while the
 * item that loses the marker and the one that gains it both change at once (DESIGN.md → Motion:
 * no motion on actions done many times a day).
 */
export const TAB_HOVER_FADE = 'hover:transition-colors hover:duration-150';
