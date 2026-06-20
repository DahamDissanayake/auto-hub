#!/bin/bash
set -e

# Resurrect tmux sessions from manifest (silently OK on first start)
node /app/src/resurrect.js || true

exec node src/server.js
