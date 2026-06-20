# Terminal: claude User, Repo Picker & Clone Flow

**Date:** 2026-06-20
**Status:** Approved

## Overview

Upgrade the browser terminal so it runs as a dedicated `claude` Linux user (same permission level as `dama`), always prompts for a working directory on page load, lets the user browse and select a specific GitHub repo under `/home/claude/github`, and offers a one-click clone flow when a repo isn't present yet.

---

## 1. System Setup (one-time, on Pi host)

A shell script (documented below) creates the `claude` user and grants it the same group memberships as `dama`.

```bash
# Run once as dama on the Pi
sudo useradd -m -s /bin/bash -G adm,dialout,cdrom,sudo,audio,video,plugdev,games,users,input,render,netdev,spi,i2c,gpio,docker claude
sudo mkdir -p /home/claude/github
sudo chown claude:claude /home/claude /home/claude/github
```

The UID/GID of `claude` (e.g. 1001:1001) must be noted and used in docker-compose.

---

## 2. Docker & Infrastructure Changes

### docker-compose.yml — terminal service

```yaml
terminal:
  build: ./terminal
  user: "1001:1001"          # claude's uid:gid
  environment:
    JWT_SECRET: ${JWT_SECRET}
    TERMINAL_DIRS: /workspace/claude-home,/workspace/github
  volumes:
    - /home/claude:/workspace/claude-home:rw
    - /home/claude/github:/workspace/github:rw
  restart: unless-stopped
```

### terminal/src/server.js

- Spawn bash with `HOME: '/workspace/claude-home'`, `USER: 'claude'`, `LOGNAME: 'claude'`
- **cwd validation**: change from exact set membership (`TERMINAL_DIRS.has(cwd)`) to a prefix check — cwd is valid if it starts with one of the configured dirs. This is required because users now connect to `/workspace/github/<repo>`, not just `/workspace/github`.
- Add `GET /repos` endpoint — scans `/workspace/github`, returns `[{ name, path, isGitRepo }]` where `isGitRepo` checks for `.git` subdir existence. Requires `Authorization: Bearer <token>` header (JWT forwarded by backend proxy).
- Add `POST /clone` endpoint — accepts `{ url, name? }`, derives name from URL if omitted, validates target dir doesn't exist, runs `git clone` via `child_process.execFile` with 120s timeout. Returns `{ path }` on success or `{ error, detail }` on failure. Requires JWT auth header.

### backend/src/terminal/terminal.controller.ts

Add two proxy endpoints that forward to the terminal service (at `http://terminal:7681`) with the user's JWT forwarded:

- `GET /api/terminal/repos` → `GET http://terminal:7681/repos`
- `POST /api/terminal/clone` → `POST http://terminal:7681/clone`

These keep the frontend calling only `/api/*`, consistent with the existing `/api/terminal/dirs` pattern.

---

## 3. UX Flow

### Step 1 — Workspace Picker (always shown on page load)

- No localStorage restore — picker appears on every visit to `/terminal`
- Two cards: **Home** (`/home/claude`) and **GitHub Repos** (`/home/claude/github`)
- Selecting **Home** immediately opens the terminal in `/workspace/claude-home`
- Selecting **GitHub Repos** navigates to Step 2

### Step 2 — Repo Picker

- Calls `GET /api/terminal/repos`
- Lists existing subdirectories as selectable cards
- Each card: repo name + green "git" badge if `isGitRepo: true`
- Empty state: "No repos cloned yet" with `+ Clone Repo` button centered
- `+ Clone Repo` button at the bottom navigates to Step 3
- Selecting a repo opens the terminal at `/workspace/github/<name>`

### Step 3 — Clone Dialog

- Input: git URL (required), folder name (optional, auto-derived from URL)
- `Clone` button → calls `POST /api/terminal/clone` → shows spinner "Cloning…"
- On success → auto-transition to terminal pointed at new repo path
- On failure → inline error (first line of stderr) + Retry button + back arrow to Step 2
- Private repo hint shown below URL input: "For private repos, set up SSH keys on the Pi first"

### In-terminal navigation

- Breadcrumb strip above the terminal: e.g. `GitHub Repos / auto-hub` with a `Change` button
- `Change` resets to Step 1 (full picker), clears current terminal session

---

## 4. Frontend Component Structure

```
frontend/src/app/(app)/terminal/
  page.tsx                    — orchestrates steps, holds step state
  components/
    WorkspacePicker.tsx       — Step 1: Home vs GitHub Repos cards
    RepoPicker.tsx            — Step 2: repo list + Clone Repo button
    CloneDialog.tsx           — Step 3: URL input, spinner, error
    TerminalBreadcrumb.tsx    — breadcrumb strip shown above xterm
```

Existing xterm setup logic stays in `page.tsx`. All pickers use the same dark palette (`#0d0d0d` bg, `#1a1a1a` card, `#2a2a2a` border, `#10b981` accent).

---

## 5. Error Handling

| Scenario | Behaviour |
|---|---|
| Clone fails (bad URL, not found) | Show first line of stderr; Retry button |
| Clone fails (private repo, no creds) | Show error + SSH key hint |
| Clone times out (>120s) | Show "Clone timed out. Try again." |
| `/repos` endpoint unreachable | Show "Failed to load repos" with Retry |
| Terminal spawn fails (claude user missing) | Existing 4500 error → "Failed to start terminal" |
| Session ends | Existing UI — Reconnect (same dir) or Change Directory (step 1) |

---

## 6. Out of Scope

- Credential management for private repos (SSH key setup is a manual Pi task)
- Deleting or renaming repos from the UI
- Multiple concurrent terminal sessions
- Repo search / filtering (covered naturally once there are more repos)
