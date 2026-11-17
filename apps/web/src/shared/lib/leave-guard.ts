/**
 * Browser only. One page-wide "unsaved changes" hook for navigations that are not link clicks —
 * a button that calls `router.push` (the EN / ع switch). A screen with edits registers a guard;
 * such a button calls `requestLeave(proceed)`, which runs `proceed` at once when nothing guards
 * the page, and otherwise hands it to the guard to run once the person confirms.
 */
export type LeaveGuard = (proceed: () => void) => void;

let current: LeaveGuard | null = null;

/** Registers the page's guard; returns the unregister function (only clears its own guard). */
export function setLeaveGuard(guard: LeaveGuard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

/** Navigate now, or let the registered guard ask first. */
export function requestLeave(proceed: () => void): void {
  if (current) current(proceed);
  else proceed();
}
