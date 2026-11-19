# Sourced by scripts/setup.sh and scripts/dev.sh — not run on its own.
#
# Local ports and Docker names. Each comes from, in order: the environment, the git-ignored root
# .env (written by `pnpm run setup` on its first run; Docker Compose reads the same file), then the
# default. Overriding them lets a second copy of the project run beside the first:
#   DB_PORT=5452 API_PORT=4901 WEB_PORT=4900 COMPOSE_PROJECT_NAME=school-erp-2 pnpm run setup
# With only COMPOSE_PROJECT_NAME changed, the container and volume are named after it.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
root_env="$root/.env"

# Value of KEY in an env file (KEY=value lines; quotes trimmed), or nothing. Never sources the file.
env_get() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 0
  sed -n -E "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1 | sed -E "s/^['\"](.*)['\"]$/\1/"
}

_local_var() {
  local key="$1" default="$2" value="${!1:-}"
  [[ -n "$value" ]] || value="$(env_get "$key" "$root_env")"
  [[ -n "$value" ]] || value="$default"
  printf -v "$key" '%s' "$value"
  export "${key?}"
}

_local_var COMPOSE_PROJECT_NAME school-erp
if [[ "$COMPOSE_PROJECT_NAME" == "school-erp" ]]; then
  _local_var DB_CONTAINER school-erp-db
  _local_var DB_VOLUME school-erp-pgdata
else
  _local_var DB_CONTAINER "${COMPOSE_PROJECT_NAME}-db"
  _local_var DB_VOLUME "${COMPOSE_PROJECT_NAME}-pgdata"
fi
_local_var DB_PORT 5442
_local_var API_PORT 3001
_local_var WEB_PORT 3000

# Writes the root .env once, so later runs (and `pnpm dev`) use the same ports and names.
write_root_env() {
  [[ -f "$root_env" ]] && return 0
  cat >"$root_env" <<EOF
# Local ports and Docker names for this copy (git-ignored; read by scripts/setup.sh, scripts/dev.sh
# and Docker Compose). Change them here, then re-run: pnpm run setup
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
DB_CONTAINER=${DB_CONTAINER}
DB_VOLUME=${DB_VOLUME}
DB_PORT=${DB_PORT}
API_PORT=${API_PORT}
WEB_PORT=${WEB_PORT}
EOF
}

# True when something is listening on the TCP port.
port_busy() { lsof -ti "tcp:$1" -sTCP:LISTEN >/dev/null 2>&1; }

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() {
  printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  exit 1
}

require_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "Docker is not installed." "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  docker info >/dev/null 2>&1 \
    || die "Docker is not running." "Start Docker Desktop (or the Docker daemon), wait until it says it is running, then try again."
}

# Starts the database container if needed and waits until it accepts connections over TCP.
start_db() {
  local state
  state="$(docker inspect -f '{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null || true)"
  if [[ "$state" != "running" ]] && port_busy "$DB_PORT"; then
    die "Port $DB_PORT is already in use, so the database can't start." \
      "Stop whatever uses it (lsof -i :$DB_PORT), or pick another port:" \
      "  DB_PORT=5443 pnpm run setup      (or edit DB_PORT in the root .env)"
  fi
  if [[ -n "$state" ]]; then
    # The container already exists (maybe made by another compose project): start it as it is.
    [[ "$state" == "running" ]] || docker start "$DB_CONTAINER" >/dev/null \
      || die "Could not start the database container ($DB_CONTAINER)." "See: docker logs $DB_CONTAINER"
  else
    (cd "$root" && docker compose up -d db >/dev/null 2>&1) || (cd "$root" && docker compose up -d db) \
      || die "Could not start the database container ($DB_CONTAINER)."
  fi
  local i
  for ((i = 0; i < 60; i++)); do
    if docker exec "$DB_CONTAINER" psql -U postgres -h 127.0.0.1 -d postgres -tAc 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "The database container ($DB_CONTAINER) did not become ready in 60 seconds." \
    "See its log: docker logs $DB_CONTAINER"
}
