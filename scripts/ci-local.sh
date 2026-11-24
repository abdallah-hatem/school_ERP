#!/usr/bin/env bash
# The same checks CI runs on every PR (.github/workflows/ci.yml calls this script), so a developer
# sees a failure before pushing. Runs on `git push` through the pre-push hook, or by hand:
#   pnpm ci:local          lint, typecheck, unit tests, module rules (what CI runs)
#   pnpm ci:local --full   the above, then API e2e and the smoke specs (needs Docker)
# A clone can opt out of the unit tests on its own machine (CI still runs them):
#   git config ci.skipUnitTests true      (per clone, never committed; `--unset` to undo)
# Full output of each step goes to .ci-local/<step>.log; the terminal gets one line per step.
set -uo pipefail
cd "$(dirname "$0")/.."

logs=.ci-local
mkdir -p "$logs"
full=false
[[ "${1:-}" == "--full" ]] && full=true

# Behind dev? A PR must start from the latest dev (CONVENTIONS → Before opening a PR); GitHub also
# refuses to merge a branch that is behind. Warn here so it's fixed before the PR, not after.
if [[ -z "${GITHUB_ACTIONS:-}" ]] && git fetch -q origin dev 2>/dev/null; then
  behind=$(git rev-list --count HEAD..origin/dev 2>/dev/null || echo 0)
  if [[ "$behind" -gt 0 ]]; then
    printf '  ! your branch is %s commit(s) behind origin/dev — run: git merge origin/dev (then re-run the checks)\n' "$behind"
  fi
fi

steps=("lint" "typecheck" "test" "deps:check" "plans:check")
if [[ -z "${GITHUB_ACTIONS:-}" && "$(git config --get ci.skipUnitTests 2>/dev/null)" == "true" ]]; then
  steps=("lint" "typecheck" "deps:check" "plans:check")
  printf '  · unit tests skipped on this machine (git config ci.skipUnitTests) — CI runs them\n'
fi
$full && steps+=("test:e2e" "smoke")

start_all=$SECONDS
for step in "${steps[@]}"; do
  start=$SECONDS
  log="$logs/${step//:/-}.log"
  if pnpm -s "$step" >"$log" 2>&1; then
    printf '  ✓ %-11s %3ss\n' "$step" $((SECONDS - start))
  else
    printf '  ✗ %-11s %3ss  — last lines of %s:\n\n' "$step" $((SECONDS - start)) "$log"
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      # On CI nobody can open the log file, and the last lines of a multi-package test run are often
      # another package's output: print the whole log in a collapsible group, then the failures.
      echo "::group::full log of $step"; cat "$log"; echo "::endgroup::"
      grep -nE '(FAIL |●|✕|×|AssertionError|error TS)' "$log" | head -n 60 | sed 's/^/    /'
    else
      tail -n 40 "$log" | sed 's/^/    /'
    fi
    printf '\nci:local FAILED at "%s". Fix it before pushing (full log: %s).\n' "$step" "$log"
    exit 1
  fi
done
printf 'ci:local passed in %ss.\n' $((SECONDS - start_all))
