#!/usr/bin/env bash
# One-time setup of a fresh clone (`pnpm run setup`; bare `pnpm setup` is pnpm's own command).
# macOS and Linux; on Windows run it inside WSL. Safe to run again: it keeps existing env files and
# only creates what is missing.
#
#   1. checks Node 20+ and pnpm 10, installs dependencies
#   2. checks Docker, starts the Postgres container and waits for it
#   3. creates apps/api/.env and apps/web/.env.local from their examples if missing, with generated
#      secrets (JWT_ACCESS_SECRET, SEED_ADMIN_PASSWORD, a VAPID pair for push alerts) — never printed
#   4. builds packages/shared, generates the Prisma client, applies the migrations
#   5. seeds the demo data unless the admin already exists (`--reseed` runs it anyway; the seed is
#      idempotent but resets the admin's password to SEED_ADMIN_PASSWORD)
#
# Ports and Docker names: see scripts/lib/local-env.sh (DB_PORT, API_PORT, WEB_PORT, ...).
set -euo pipefail
# shellcheck source=lib/local-env.sh
source "$(dirname "$0")/lib/local-env.sh"
cd "$root"

reseed=false
[[ "${1:-}" == "--reseed" ]] && reseed=true

api_env="apps/api/.env"
web_env="apps/web/.env.local"

# ── 1. Node, pnpm, dependencies ──────────────────────────────────────────────
say "1/6 Checking Node and pnpm"
command -v node >/dev/null 2>&1 || die "Node.js is not installed." "Install Node 20 or newer: https://nodejs.org/"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" -ge 20 ]] || die "Node $(node -v) is too old; this project needs Node 20 or newer." \
  "Install a newer Node (https://nodejs.org/, or: nvm install 22)."
command -v pnpm >/dev/null 2>&1 || die "pnpm is not installed." \
  "Enable it through Corepack (ships with Node): corepack enable" \
  "then open a new terminal and run this again."
pnpm_major="$(pnpm --version | cut -d. -f1)"
[[ "$pnpm_major" == "10" ]] || die "pnpm $(pnpm --version) found; this project needs pnpm 10." \
  "Use the version pinned in package.json: corepack enable  (then open a new terminal)."
echo "  node $(node -v), pnpm $(pnpm --version)"

say "2/6 Installing dependencies"
pnpm install

# ── 2. Docker and the database ───────────────────────────────────────────────
say "3/6 Starting the database (container $DB_CONTAINER, port $DB_PORT)"
require_docker
write_root_env
start_db
echo "  database is ready"

# ── 3. Env files ─────────────────────────────────────────────────────────────
say "4/6 Env files"
set_key() { # set_key FILE KEY VALUE — replaces KEY= or "# KEY=" lines, appends when absent
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^[#[:space:]]*" k "=" { if (!done) { print k "=" v; done = 1 }; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

# A Web Push (VAPID) pair for this clone's push alerts, from the API's own web-push package.
set_vapid() {
  local keys
  keys="$(cd apps/api && node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")"
  set_key "$api_env" VAPID_PUBLIC_KEY "${keys%% *}"
  set_key "$api_env" VAPID_PRIVATE_KEY "${keys##* }"
  set_key "$api_env" VAPID_SUBJECT "mailto:dev@localhost.test"
}

if [[ ! -f "$api_env" ]]; then
  cp apps/api/.env.example "$api_env"
  chmod 600 "$api_env"
  set_key "$api_env" PORT "$API_PORT"
  set_key "$api_env" DATABASE_URL "postgresql://postgres:postgres@localhost:${DB_PORT}/school_erp?schema=public"
  set_key "$api_env" CORS_ORIGIN "http://localhost:${WEB_PORT}"
  set_key "$api_env" UPLOADS_DIR uploads
  set_key "$api_env" JWT_ACCESS_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  set_key "$api_env" COOKIE_SECURE false
  set_key "$api_env" SEED_ADMIN_PASSWORD "$(openssl rand -hex 12)"
  set_vapid
  echo "  created $api_env (generated JWT_ACCESS_SECRET, SEED_ADMIN_PASSWORD and a VAPID pair)"
else
  # An older .env may lack the two generated values; add them without touching anything else.
  if [[ -z "$(env_get JWT_ACCESS_SECRET "$api_env")" ]]; then
    set_key "$api_env" JWT_ACCESS_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
    echo "  $api_env: added a generated JWT_ACCESS_SECRET"
  fi
  if [[ -z "$(env_get SEED_ADMIN_PASSWORD "$api_env")" ]]; then
    set_key "$api_env" SEED_ADMIN_PASSWORD "$(openssl rand -hex 12)"
    echo "  $api_env: added a generated SEED_ADMIN_PASSWORD"
  fi
  if [[ -z "$(env_get VAPID_PUBLIC_KEY "$api_env")" ]]; then
    set_vapid
    echo "  $api_env: added a generated VAPID pair (push alerts)"
  fi
  echo "  kept $api_env"
fi

if [[ ! -f "$web_env" ]]; then
  cp apps/web/.env.example "$web_env"
  set_key "$web_env" BASE_URL "http://localhost:${API_PORT}"
  echo "  created $web_env"
else
  echo "  kept $web_env"
fi

database_url="$(env_get DATABASE_URL "$api_env")"
[[ -n "$database_url" ]] || die "DATABASE_URL is empty in $api_env."
uploads_dir="$(env_get UPLOADS_DIR "$api_env")"
mkdir -p "apps/api/${uploads_dir:-uploads}"

# ── 4. Build, Prisma, migrations ─────────────────────────────────────────────
say "5/6 Building packages/shared, generating the Prisma client, applying migrations"
pnpm --filter @school-erp/shared build
(cd apps/api && pnpm exec prisma generate >/dev/null && echo "  prisma client generated")
(cd apps/api && DATABASE_URL="$database_url" pnpm exec prisma migrate deploy)

# ── 5. Seed ──────────────────────────────────────────────────────────────────
say "6/6 Demo data"
admin_email="$(node -p "require('./packages/shared').SEED_ADMIN_EMAIL")"
db_name="$(printf '%s' "$database_url" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
admin_exists="$(docker exec "$DB_CONTAINER" psql -U postgres -d "$db_name" -tAc \
  "select 1 from users where email = '${admin_email}'" 2>/dev/null || true)"
if [[ "$admin_exists" == "1" && "$reseed" == false ]]; then
  echo "  the admin already exists; seed skipped (pnpm run setup --reseed to run it again)"
else
  (
    cd apps/api
    DATABASE_URL="$database_url" \
      SEED_ADMIN_PASSWORD="$(env_get SEED_ADMIN_PASSWORD .env)" \
      JWT_ACCESS_SECRET="$(env_get JWT_ACCESS_SECRET .env)" \
      pnpm exec ts-node --transpile-only prisma/seed/index.ts
  )
fi

api_port="$(env_get PORT "$api_env")"
cat <<EOF

$(say "Setup done.")
  Start the app:  pnpm dev
  Web:            http://localhost:${WEB_PORT}
  API:            http://localhost:${api_port:-$API_PORT}
  Sign in as:     ${admin_email}
  Password:       SEED_ADMIN_PASSWORD in ${api_env}  (show it: grep SEED_ADMIN_PASSWORD ${api_env})
EOF
