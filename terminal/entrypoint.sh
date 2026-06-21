#!/bin/bash
set -e

export LANG=C.utf8
export LC_ALL=C.utf8

# Write persistent tmux config to HOME (volume-backed, survives container restarts).
# tmux reads ~/.tmux.conf every time the server starts, so options are always active.
# mouse on: tmux sends \x1b[?1000h which puts xterm in mouse-tracking mode so wheel
# events are forwarded as PTY sequences rather than arrow keys (no history cycling).
TMUX_CONF="${HOME}/.tmux.conf"
if [ ! -f "$TMUX_CONF" ]; then
  cat > "$TMUX_CONF" << 'EOF'
set -g mouse on
set -g history-limit 50000
EOF
fi

# Resurrect tmux sessions from manifest (silently OK on first start)
node /app/src/resurrect.js || true

exec node src/server.js
