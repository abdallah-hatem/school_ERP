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
- Every brief for a PR that changes a screen asks for headless screenshots (EN desktop + AR phone)
  from a scratch copy on a throwaway database before reporting — "stay off the shared databases"
  means use a throwaway one, not skip the look. The owner wants changed screens seen before merge
  ("check in browser of course"). — 2026-11-18
- Into `dev`, I merge for the owner: my own green, screen-checked PRs with `gh pr merge --admin`
  (dev needs a CODEOWNERS approval; his account can't approve itself), and Tamer's after my review
  (code + screenshots) comes back clean — approve, then merge; otherwise report the fixes. Never
  `--admin` into `testing`/`production`/`demo`. ("I allow you to merge for me as well") — 2026-11-20
