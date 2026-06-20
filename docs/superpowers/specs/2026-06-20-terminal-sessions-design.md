# Terminal: Persistent Sessions, Full Permissions & Workspace Expansion

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

Two-part upgrade to the Code Terminal app:

- **Spec A — Infrastructure**: rename the app, give the `claude` container user full sudo, add `/home/dama/repo/auto-hub` as a selectable workspace, install dev tool parity with the `dama` user.
- **Spec B — Persistent Named Sessions**: tmux-backed sessions that survive browser close, logout, and container restarts; named session picker UI with tab-switching and session lifecycle controls.

---

## Spec A — Infrastructure

### 1. App Rename

`frontend/src/app/(app)/apps/apps.config.ts` — change `name` from `'Claude Code Terminal'` to `'Code Terminal'`.

### 2. Claude User — Full Sudo Inside Container

Install `sudo` in the terminal `Dockerfile`. Add `/etc/sudoers.d/claude` during the build:

```
claude ALL=(ALL) NOPASSWD:ALL
```

This gives the `claude` user unrestricted root-equivalent access inside the container (same experience as a normal admin shell), without changing anything on the Pi host.

### 3. Tool Parity with `dama`

Add to `Dockerfile` apt install line:

```
sudo vim nano htop jq zip unzip build-essential python3 python3-pip ripgrep tmux
```

Install Node 20 via NodeSource (matching the Pi's node version) so `node` and `npm` are on PATH.

Install Claude Code CLI globally after node is available:

```dockerfile
RUN npm install -g @anthropic-ai/claude-code
```

Mount the Docker socket into the terminal container so `docker` commands work:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

Add the `docker` group inside the container so `claude` can use the socket without `sudo`:

```dockerfile
RUN groupadd --gid $(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo 999) docker-host 2>/dev/null || true && \
    usermod -aG docker-host claude 2>/dev/null || true
```

> Note: Docker socket GID is resolved at runtime; the entrypoint script handles the group membership dynamically if the GID differs from build time (see Spec B entrypoint).

### 4. Auto-Hub Workspace

**docker-compose.yml** — add volume and env var:

```yaml
terminal:
  environment:
    TERMINAL_DIRS: /workspace/data,/workspace/github,/workspace/auto-hub
  volumes:
    - /home/dama/repo/auto-hub:/workspace/auto-hub:rw
```

**`WorkspacePicker.tsx`** — add third button:

```
Auto-Hub Repo    /home/dama/repo/auto-hub
```

`onSelect` type expands to `'home' | 'github' | 'auto-hub'`.

**`page.tsx`** — `handleWorkspaceSelect` maps `'auto-hub'` → `cwd = '/workspace/auto-hub'`.

---

## Spec B — Persistent Named Sessions

### Architecture

tmux runs inside the terminal container as a session daemon. A JSON manifest at `/workspace/data/.terminal-sessions.json` (SSD-backed, survives restarts) stores each session's metadata. On container start, an entrypoint script reads the manifest and recreates any sessions that aren't currently live in tmux. The WebSocket attaches to a named tmux session instead of spawning a bare shell.

### Session Data Model

```json
{
  "sessions": [
    {
      "name": "auto-hub-dev",
      "cwd": "/workspace/auto-hub",
      "workspace": "auto-hub",
      "repoName": null,
      "createdAt": "2026-06-20T12:00:00.000Z",
      "lastActive": "2026-06-20T14:23:00.000Z"
    }
  ]
}
```

`workspace` is one of `"home" | "github" | "auto-hub"`. `repoName` is set for github workspace sessions.

### Container Entrypoint (`terminal/entrypoint.sh`)

Replaces the bare `node src/server.js` CMD:

```bash
#!/bin/bash
set -e

# Fix Docker socket group membership at runtime
if [ -S /var/run/docker.sock ]; then
  DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
  groupmod -g "$DOCKER_GID" docker-host 2>/dev/null || true
fi

# Resurrect tmux sessions from manifest
node /app/src/resurrect.js

exec node src/server.js
```

### Resurrection Script (`terminal/src/resurrect.js`)

Reads `/workspace/data/.terminal-sessions.json`. For each session, checks whether a tmux session with that name already exists (`tmux has-session -t <name>`). If not, creates one:

```bash
tmux new-session -d -s <name> -c <cwd>
```

Running processes cannot be restored (tmux limitation) but the shell starts in the correct working directory.

### Terminal Service REST Endpoints (3 new)

All require `Authorization: Bearer <token>`.

#### `GET /sessions`

Reads manifest, cross-references with `tmux list-sessions -F '#{session_name}'`, returns:

```json
[
  {
    "name": "auto-hub-dev",
    "cwd": "/workspace/auto-hub",
    "workspace": "auto-hub",
    "repoName": null,
    "alive": true,
    "lastActive": "2026-06-20T14:23:00.000Z",
    "createdAt": "2026-06-20T12:00:00.000Z"
  }
]
```

`alive: false` means the session is in the manifest but tmux doesn't have it (container restarted before resurrection ran, or resurrection failed).

#### `POST /sessions`

Body: `{ name, cwd, workspace, repoName? }`

Validates: `name` must be non-empty, no `/` or `..`, max 40 chars. Returns 409 if name already exists in manifest.

Creates tmux session: `tmux new-session -d -s <name> -c <cwd>`

Writes entry to manifest. Returns `{ name, cwd, workspace, repoName, createdAt, alive: true }`.

#### `DELETE /sessions/:name`

Kills tmux session: `tmux kill-session -t <name>` (ignores error if already dead).

Removes entry from manifest. Returns `{ ok: true }`.

### WebSocket Change

Current: spawns `bash -l` with given `cwd`.

New: parameter changes from `cwd` to `session` (session name). Server looks up the session's `cwd` from the manifest, then node-pty runs:

```
tmux attach-session -t <name>
```

With env `HOME=/workspace/data`, `USER=claude`, `LOGNAME=claude`, `TERM=xterm-256color`.

The `isValidCwd` check moves to session creation time (POST /sessions validates the cwd); the WebSocket only validates that the session name exists in the manifest.

### Backend Proxy Endpoints

`backend/src/terminal/terminal.controller.ts` — 3 new methods proxying to terminal service:

- `GET /api/terminal/sessions`
- `POST /api/terminal/sessions`
- `DELETE /api/terminal/sessions/:name`

Same pattern as existing `/api/terminal/repos` and `/api/terminal/clone`.

### Frontend Step Flow

```
'session' → 'workspace' → 'repo' → 'clone' → 'terminal'
```

New state fields: `sessionName: string | null`, `sessions: Session[]`.

#### New Components

**`SessionManager.tsx`** (replaces WorkspacePicker as the first screen)

- Header: "Code Terminal" + "+" button (icon-only, opens CreateSessionDialog)
- Session list: each row shows session name, workspace label, alive badge (green dot / grey dot), last-active timestamp
- Row actions: [Open] [End ✕]
- Empty state: "No sessions yet — create one to get started"
- On mount: calls `GET /api/terminal/sessions`

**`CreateSessionDialog.tsx`**

- Single text input: "Session name" (e.g. `auto-hub-dev`)
- Validate on submit: non-empty, ≤40 chars, no slashes
- On submit: moves to workspace picker (name stored in state, session created after workspace is selected)

#### Session Tabs (above terminal)

Horizontal strip shown only when `step === 'terminal'`, above the breadcrumb:

```
[auto-hub-dev ✕]  [notes ✕]  [+]
```

- Each tab: session name + ✕ (end + close tab)
- "+" opens SessionManager overlay (to attach an existing session or create a new one)
- Active tab highlighted with accent border
- Clicking a non-active tab: close current WebSocket, clear xterm, open new WebSocket to that session

Tabs are stored in React state as `openTabs: string[]` (session names visited this browser session). They are **not** persisted to localStorage — the tab strip reflects what you've opened in this browser visit. The sessions themselves persist server-side.

#### Updated `TerminalBreadcrumb.tsx`

Shows: `[SessionName] › [Workspace / RepoName]` + `Change Dir` button.

`Change Dir` now resets to `step = 'session'` (back to session manager, not workspace picker).

#### `page.tsx` Flow

```
'session':   <SessionManager onOpen={handleSessionOpen} />
'workspace': <WorkspacePicker onSelect={handleWorkspaceSelect} onBack={() => setStep('session')} />
'repo':      <RepoPicker ... />
'clone':     <CloneDialog ... />
'terminal':  tabs + breadcrumb + xterm
```

`handleSessionOpen(session)` — if session is alive, go straight to terminal (skip workspace picker). If session is new (just named, not yet created), go to workspace picker; after workspace selected, call `POST /api/terminal/sessions` then open WebSocket.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Session name collision | POST /sessions returns 409 → "A session with that name already exists" |
| tmux session dead on attach | WebSocket close 4500 → "Session ended. Reconnect or go back." |
| Manifest unreadable | GET /sessions returns `[]`, UI shows empty state |
| Container restart mid-session | resurrection script recreates tmux session at correct cwd on next start |
| Docker socket not available | `docker` CLI fails gracefully (socket mount is `:ro`, not required for terminal function) |

---

## Out of Scope

- Restoring running processes after container restart (tmux limitation)
- Sharing sessions between users
- Session search / filtering
- Session rename
- Persisting tab order across browser sessions
