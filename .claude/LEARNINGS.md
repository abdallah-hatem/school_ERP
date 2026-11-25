# Learnings

Corrections recorded so they don't have to be repeated. Loaded at session start.

## Local app and tests
- The owner's local `school_erp` data is fake demo data: when running the local app, apply pending
  migrations directly — no backups, no "your data changed" notes. ("I dont care at all about current
  data its fake") — 2026-11-22
- Smoke and API e2e run on GitHub CI only — never locally, not in a worktree, not "to rule out a
  flake", not to verify a fix. Unit tests too, on the owner's machine (2026-11-24): this clone has
  `git config ci.skipUnitTests true`, so the hook runs lint and typecheck only. The team's default stays. Review screenshots come from a
  short headless capture script on a throwaway stack, not the smoke suite. A CI failure is fixed from
  CI's logs and artifacts, then CI re-runs. Every agent brief says so. I broke this by telling agents to
  run suites locally ("are agents running tests here locally ??? or on ci as we said ?"). Also: a
  `next build` in the checkout serving :3000 breaks the running app's CSS. — 2026-11-18, 2026-11-21

## Docs
- Only the merger writes `docs/BUILD_LOG.md` (CONVENTIONS → The PR): never tell an agent to edit it;
  its PR body carries a "Log entry". At session start, compare the log with PRs merged into `dev`
  and add what's missing. — 2026-11-18
- Update `docs/BUILD_LOG.md` in the same turn as each merge, owner decision, review result or work
  started — not only after a merge, never batched (a small docs PR is fast: docs-only PRs skip
  e2e/smoke). The owner has had to ask three times ("dont forget frequent documentation", "dont forget
  to frequently document"). — 2026-11-18, 2026-11-23
- Every brief for a PR that changes a screen asks for headless screenshots (EN desktop + AR phone)
  from a scratch copy on a throwaway database before reporting — "stay off the shared databases"
  means use a throwaway one, not skip the look. The owner wants changed screens seen before merge
  ("check in browser of course"). — 2026-11-18
- Into `dev`, I merge for the owner: my own green, screen-checked PRs with `gh pr merge --admin`
  (dev needs a CODEOWNERS approval; his account can't approve itself), and Tamer's after my review
  (code + screenshots) comes back clean — approve, then merge; otherwise report the fixes. Never
  `--admin` into `testing`/`production`/`demo`. ("I allow you to merge for me as well") — 2026-11-20
- Don't repeat on a screen what it already shows: the payroll month's tiles already carry the
  totals, so a "Month total" card under them was removed ("we dont need the month card its already
  at the cards at the top"). Check the page's tiles/headers before adding a summary row or card.
  — 2026-11-20
- Every money input groups thousands live through the shared `MoneyField`/`MoneyInput`; a guard
  test enforces it. When reviewing Tamer's PRs, check new inputs and screens against the shared
  components — the hand-rolled example box slipped through #83. — 2026-11-20
- Review briefs (mine and for Tamer's PRs) check the **loading** state of every new or changed screen, not
  only the loaded one: skeleton header (buttons, pills, tabs) and the route registered in the skeleton
  shape check. #171 shipped the Approved payroll pages unregistered and without header skeletons; the
  review only looked at loaded screens ("why our review did not pick that up ?????"). Also re-check a
  page's height when its layout changes (table → cards made the month page too long). — 2026-11-21
- No client-side paging, search, filtering or sorting of fetched lists — the API pages, searches, sorts
  and totals; only static config may be filtered in the browser. My #146 and Tamer's #171 loaded whole
  months and sliced them; every review brief checks for `.slice/.filter/.sort` on fetched lists. — 2026-11-21
- Times shown to users are 12-hour with AM/PM (AR ص/م) through the shared formatter. — 2026-11-21
- A record's attachments (signed copies, documents) show on its row in every list of those records,
  not only on the detail page; the owner shouldn't have to open the employee to see a contract's
  file ("I dont have to go to that specific employee page"). — 2026-11-25
