#!/usr/bin/env bash
# A new module needs a plan (owner, 2026-11-18). Runs in `pnpm ci:local` (push hook + CI).
#
# A "new module" is a folder under apps/api/src/modules/ or apps/web/src/modules/ that the base
# branch (dev, or the PR's target on GitHub) doesn't have yet. It needs a plan in docs/plans/ whose
# file name contains the module's name (e.g. docs/plans/2026-11-18-accounting-plan.md), already on
# the base or added in the same change, with a Spec, its Tasks and the Edge cases — the shape of
# docs/plans/2026-11-17-audit-log-plan.md. The check doesn't judge the plan; review does.
set -uo pipefail
cd "$(dirname "$0")/.."

base_branch="${GITHUB_BASE_REF:-dev}"
git fetch -q --depth=1 origin "$base_branch" 2>/dev/null || true
base="origin/$base_branch"
if ! git rev-parse -q --verify "$base" >/dev/null; then
  echo "module plans: can't find $base — skipped"
  exit 0
fi

modules_in() { # <ref|WORKTREE> <dir>
  if [[ "$1" == WORKTREE ]]; then
    [[ -d "$2" ]] && find "$2" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -u
  else
    git ls-tree -d --name-only "$1:$2" 2>/dev/null | sort -u
  fi
}

missing=0
for dir in apps/api/src/modules apps/web/src/modules; do
  new=$(comm -13 <(modules_in "$base" "$dir") <(modules_in WORKTREE "$dir"))
  for module in $new; do
    plan=$(ls docs/plans/*"$module"*.md 2>/dev/null | head -1)
    if [[ -z "$plan" ]]; then
      printf '  ✗ new module "%s" (%s) has no plan — add docs/plans/<date>-%s-plan.md\n' "$module" "$dir" "$module"
      missing=1
      continue
    fi
    for section in "spec" "task" "edge case"; do
      if ! grep -qi "$section" "$plan"; then
        printf '  ✗ %s: the plan for "%s" has no %s section\n' "$plan" "$module" "$section"
        missing=1
      fi
    done
  done
done

if [[ $missing -ne 0 ]]; then
  echo
  echo "A new module needs a plan with its Spec, Tasks and Edge cases (see docs/plans/2026-11-17-audit-log-plan.md and docs/CONVENTIONS.md → Plans)."
  exit 1
fi
echo "module plans: ok"
