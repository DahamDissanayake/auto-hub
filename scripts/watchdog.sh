#!/bin/bash
# Restarts any containers in the auto-hub stack that are not in "running" state.
set -euo pipefail

cd /home/dama/repo/auto-hub

NOT_RUNNING=$(docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null | grep -v ' running' || true)

if [ -n "$NOT_RUNNING" ]; then
    echo "$(date): Unhealthy containers detected, running docker compose up -d"
    echo "$NOT_RUNNING"
    docker compose up -d
else
    echo "$(date): All containers running OK"
fi
