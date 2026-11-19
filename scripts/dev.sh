#!/usr/bin/env bash
# `pnpm dev`: the database (started if needed), packages/shared in watch mode, the API (Nest watch)
# and the web app (next dev) together, through Turbo. Output is prefixed per app; Ctrl+C stops all.
# The API reads apps/api/.env, the web app apps/web/.env.local (both made by `pnpm run setup`).
set -euo pipefail
# shellcheck source=lib/local-env.sh
source "$(dirname "$0")/lib/local-env.sh"
cd "$root"

[[ -f apps/api/.env && -f apps/web/.env.local && -d node_modules ]] \
  || die "This copy isn't set up yet." "Run: pnpm run setup"

api_port="$(env_get PORT apps/api/.env)"
api_port="${api_port:-3001}"
for port in "$api_port" "$WEB_PORT"; do
  if port_busy "$port"; then
    die "Port $port is already in use." \
      "Another server (maybe an earlier pnpm dev) is running: lsof -i :$port shows it." \
      "Stop it, or change the port (PORT in apps/api/.env with BASE_URL in apps/web/.env.local; WEB_PORT in the root .env with CORS_ORIGIN in apps/api/.env)."
  fi
done

require_docker
start_db

say "Web http://localhost:${WEB_PORT}  ·  API http://localhost:${api_port}  ·  Ctrl+C stops both"
exec pnpm exec turbo run dev --ui=stream
