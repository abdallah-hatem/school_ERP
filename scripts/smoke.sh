#!/usr/bin/env bash
# Smoke check (`pnpm smoke`): the Playwright specs in apps/web/e2e against a fresh stack it starts
# and stops itself — no developer server is used.
#
#   1. recreates the database school_erp_e2e_${SMOKE_DB:-18} on the docker-compose Postgres (5442)
#      and migrates it (scripts/e2e-db.sh); with E2E_PG_URL set (CI) on that server instead
#   2. seeds it (generic fallback data unless prisma/seed-data.local/ exists), with an HR admin
#      password generated for this run only
#   3. builds and starts the API (port ${SMOKE_API_PORT:-4180}) and the web app (${SMOKE_WEB_PORT:-4181})
#   4. runs Playwright, then stops both servers by PID
#
# Output is quiet: full logs go to apps/web/e2e/.logs/, the summary and any failures are printed.
# Extra arguments go to Playwright (e.g. `pnpm smoke 03-penalties`).
set -euo pipefail

# On a machine that has ~/.config/school-erp/e2e-ci-only (the owner's, so also every Claude agent on it),
# smoke runs on GitHub CI only (owner, 2026-11-21). Other developers run it locally as usual.
if [[ "${GITHUB_ACTIONS:-}" != "true" && -f "$HOME/.config/school-erp/e2e-ci-only" ]]; then
  echo "✗ On this machine pnpm smoke runs on GitHub CI only (owner rule). Push and let CI run it." >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
n="${SMOKE_DB:-18}"
api_port="${SMOKE_API_PORT:-4180}"
web_port="${SMOKE_WEB_PORT:-4181}"
db="school_erp_e2e_${n}"
pg_server="${E2E_PG_URL:-postgresql://postgres:postgres@localhost:5442}"
db_url="${pg_server}/${db}?schema=public"
logs="$root/apps/web/e2e/.logs"
mkdir -p "$logs"

api_pid=""
web_pid=""
uploads=""
stop_servers() {
  for pid in "$web_pid" "$api_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  if [[ -n "$uploads" ]]; then rm -rf "$uploads"; fi
}
trap stop_servers EXIT INT TERM

step() { printf 'smoke: %s\n' "$*"; }
fail() {
  printf 'smoke: FAILED — %s (log: %s)\n' "$1" "$2" >&2
  tail -n 40 "$2" >&2 || true
  exit 1
}

for port in "$api_port" "$web_port"; do
  if lsof -ti "tcp:${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "smoke: port ${port} is already in use — stop that server or set SMOKE_API_PORT / SMOKE_WEB_PORT" >&2
    exit 1
  fi
done

SEED_ADMIN_PASSWORD="$(openssl rand -hex 16)"
export SEED_ADMIN_PASSWORD
jwt_secret="$(openssl rand -hex 32)"

step "database ${db}"
drop_sql="DROP DATABASE IF EXISTS ${db} WITH (FORCE)"
if [[ -n "${E2E_PG_URL:-}" ]]; then
  PGOPTIONS=--client-min-messages=warning psql "${E2E_PG_URL}/postgres" -qc "$drop_sql" >/dev/null \
    || fail "dropping ${db} (is Postgres at E2E_PG_URL up?)" /dev/null
else
  docker exec -e PGOPTIONS=--client-min-messages=warning school-erp-db psql -U postgres -qc "$drop_sql" >/dev/null \
    || fail "dropping ${db} (is the school-erp-db container running? docker compose up -d)" /dev/null
fi
"$root/scripts/e2e-db.sh" "$n" >"$logs/db.log" 2>&1 || fail "creating ${db}" "$logs/db.log"

step "building shared, api and web"
pnpm --filter @school-erp/shared build >"$logs/build.log" 2>&1 || fail "building shared" "$logs/build.log"
pnpm --filter api exec nest build >>"$logs/build.log" 2>&1 || fail "building the api" "$logs/build.log"
# NEXT_PUBLIC_E2E_HOOKS: test-only hooks (window.__e2eToast) baked into this build, never a real one.
(cd "$root/apps/web" && BASE_URL="http://localhost:${api_port}" NEXT_PUBLIC_E2E_HOOKS=true pnpm exec next build) >>"$logs/build.log" 2>&1 \
  || fail "building the web app" "$logs/build.log"

uploads="$(mktemp -d)"
api_env=(
  NODE_ENV=development
  PORT="$api_port"
  DATABASE_URL="$db_url"
  CORS_ORIGIN="http://localhost:${web_port}"
  UPLOADS_DIR="$uploads"
  JWT_ACCESS_SECRET="$jwt_secret"
  COOKIE_SECURE=false
  # Every spec signs in through the API and the browser from 127.0.0.1, far quicker than a person:
  # limits nobody reaches here. The real values are tested in the API e2e (security.e2e-spec.ts).
  RATE_LIMIT_GLOBAL=1000000
  RATE_LIMIT_GLOBAL_IP=1000000
  RATE_LIMIT_AUTH=1000000
  RATE_LIMIT_AUTH_IP=1000000
  RATE_LIMIT_REFRESH=1000000
  RATE_LIMIT_HEAVY=1000000
)

step "seeding"
(cd "$root/apps/api" && env "${api_env[@]}" pnpm exec ts-node --transpile-only prisma/seed/index.ts) \
  >"$logs/seed.log" 2>&1 || fail "seeding" "$logs/seed.log"

wait_for() {
  local url="$1" pid="$2" log="$3"
  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then return 0; fi
    kill -0 "$pid" 2>/dev/null || fail "server exited before answering ${url}" "$log"
    sleep 1
  done
  fail "no answer from ${url} after 120 s" "$log"
}

step "starting the api on ${api_port} and the web app on ${web_port}"
(cd "$root/apps/api" && exec env "${api_env[@]}" node dist/main.js) >"$logs/api.log" 2>&1 &
api_pid=$!
wait_for "http://localhost:${api_port}/health" "$api_pid" "$logs/api.log"

(cd "$root/apps/web" && exec env BASE_URL="http://localhost:${api_port}" PORT="$web_port" \
  node node_modules/next/dist/bin/next start --port "$web_port") >"$logs/web.log" 2>&1 &
web_pid=$!
wait_for "http://localhost:${web_port}/en/login" "$web_pid" "$logs/web.log"

step "running the specs"
set +e
(cd "$root/apps/web" && BASE_URL="http://localhost:${web_port}" API_URL="http://localhost:${api_port}" \
  pnpm exec playwright test "$@") >"$logs/playwright.log" 2>&1
status=$?
set -e

# Summary lines ("6 passed (1.2m)", "1 failed", …) and, on failure, the failures in full.
grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped|did not run)' "$logs/playwright.log" || true
if [[ $status -ne 0 ]]; then
  # Every failing test's title first (the details below are cut at 200 lines).
  grep -E '^  [0-9]+\) ' "$logs/playwright.log" || true
  sed -n '/^  [0-9]*) /,$p' "$logs/playwright.log" | head -n 200
  echo "smoke: FAILED — full log: apps/web/e2e/.logs/playwright.log" >&2
  exit "$status"
fi
echo "smoke: passed — screenshots in apps/web/e2e/screenshots/"
