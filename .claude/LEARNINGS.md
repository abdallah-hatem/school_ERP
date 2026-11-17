# Learnings

Corrections recorded so they don't have to be repeated. Loaded at session start.

## Local app and tests
- Never run `pnpm smoke` (or any `next build`) in the checkout that serves the owner's local app on
  :3000 — smoke rebuilds `apps/web/.next`, the running server then points at replaced files and
  pages load without CSS (only incognito shows it; normal browsers serve cached CSS). Run smoke in a
  worktree; if it already happened, rebuild and restart the local app. — 2026-11-18
