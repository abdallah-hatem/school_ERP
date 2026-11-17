#!/usr/bin/env bash
# Creates (if missing) and migrates one e2e database on the local docker-compose Postgres (5442),
# so parallel agents never share a database.
#
#   scripts/e2e-db.sh 3
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5442/school_erp_e2e_3?schema=public \
#     PORT=4103 pnpm --filter api test:e2e
set -euo pipefail

n="${1:-}"
if [[ ! "$n" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "usage: scripts/e2e-db.sh <n>   (n: letters, digits or _)" >&2
  exit 1
fi

container="school-erp-db"
db="school_erp_e2e_${n}"
url="postgresql://postgres:postgres@localhost:5442/${db}?schema=public"
root="$(cd "$(dirname "$0")/.." && pwd)"

if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
  echo "Postgres container '$container' is not running — run: docker compose up -d" >&2
  exit 1
fi

exists="$(docker exec "$container" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'")"
if [[ "$exists" != "1" ]]; then
  docker exec "$container" psql -U postgres -c "CREATE DATABASE ${db}" >/dev/null
  echo "created ${db}"
fi

(cd "$root/apps/api" && DATABASE_URL="$url" pnpm exec prisma migrate deploy)

echo "DATABASE_URL=${url}"
