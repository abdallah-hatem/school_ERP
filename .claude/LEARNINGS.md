# Learnings

Corrections recorded so they don't have to be repeated. Loaded at session start.

## Local app and tests
- Never run `pnpm smoke` (or any `next build`) in the checkout that serves the owner's local app on
  :3000 — smoke rebuilds `apps/web/.next`, the running server then points at replaced files and
  pages load without CSS (only incognito shows it; normal browsers serve cached CSS). Run smoke in a
  worktree; if it already happened, rebuild and restart the local app. — 2026-11-18

## Docs
- Only the merger writes `docs/BUILD_LOG.md` (CONVENTIONS → The PR): never tell an agent to edit it;
  its PR body carries a "Log entry". At session start, compare the log with PRs merged into `dev`
  and add what's missing. — 2026-11-18
- Update `docs/BUILD_LOG.md` in the same turn as each merge or owner decision (a small docs PR is
  fast now: docs-only PRs skip e2e/smoke). Never batch it for "after the next few merges" — the
  owner had to ask twice ("dont forget frequent documentation"). — 2026-11-18
