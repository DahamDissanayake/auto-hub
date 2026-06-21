#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh [service...]
# With no args: rebuilds and redeploys all services.
# With args:    rebuilds and redeploys only the named services (e.g. frontend backend).
set -euo pipefail

cd "$(dirname "$0")/.."

SERVICES=("$@")

# Remove any stale containers that conflict with compose-managed names.
# This happens when containers are created outside of compose (e.g. docker build + docker run).
cleanup_stale() {
  local service="$1"
  local container="auto-hub-${service}-1"
  if docker inspect "$container" &>/dev/null; then
    local managed
    managed=$(docker inspect "$container" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)
    if [ -z "$managed" ]; then
      echo "Removing stale container: $container"
      docker rm -f "$container"
    fi
  fi
}

if [ ${#SERVICES[@]} -eq 0 ]; then
  echo "Rebuilding and redeploying all services..."
  docker compose build --pull
  docker compose up -d --remove-orphans
else
  for svc in "${SERVICES[@]}"; do
    cleanup_stale "$svc"
  done
  echo "Rebuilding: ${SERVICES[*]}"
  docker compose build --pull "${SERVICES[@]}"
  echo "Redeploying: ${SERVICES[*]}"
  docker compose up -d --no-deps "${SERVICES[@]}"
fi

echo ""
echo "Container status:"
docker compose ps
