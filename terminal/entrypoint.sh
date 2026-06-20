#!/bin/bash
set -e

export LANG=C.utf8
export LC_ALL=C.utf8

# Resurrect tmux sessions from manifest (silently OK on first start)
node /app/src/resurrect.js || true

exec node src/server.js
