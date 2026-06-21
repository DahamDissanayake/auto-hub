# Claude Code Profile Switcher

**Date:** 2026-06-21  
**Status:** Approved

## Overview

Add multi-account support to the Auto-Hub terminal app so the user can maintain multiple Claude Code logins (e.g. work, personal) and switch between them from the terminal UI. Only the active `~/.claude/.credentials.json` changes on a switch — all other data, permissions, and tmux sessions are untouched.

---

## 1. Data Storage

All state lives on the host filesystem under `/home/dama/.claude/`, which is already mounted read-write into the terminal container (`/home/dama:/home/dama:rw`). No new volumes or database tables are needed.

```
/home/dama/.claude/
  .credentials.json            ← active credentials (read by Claude Code CLI)
  profiles/
    meta.json                  ← { "active": "work" | null, "profiles": [{ "name": "work", "addedAt": "..." }] }
    work.json                  ← saved credentials for "work" account
    personal.json              ← saved credentials for "personal" account
```

**Switching:** copy `profiles/<name>.json` → `.credentials.json`, update `meta.json`.  
**Adding:** run OAuth login flow, wait for `.credentials.json` to be updated by Claude Code CLI, copy result to `profiles/<name>.json`, update `meta.json`.  
**Deleting:** remove `profiles/<name>.json`, remove entry from `meta.json`. If the deleted profile was active, clear `meta.active` to `null` (do not touch `.credentials.json`).

---

## 2. Reboot Survivability

On terminal service startup (before the HTTP server begins accepting connections), a bootstrap function reads `meta.json`. If `meta.active` is set and the corresponding profile file exists, it copies that file to `.credentials.json`. This ensures the correct account is active after any container restart or reboot.

In-progress login sessions (child processes awaiting a code) are intentionally not persisted — they are transient and the user simply restarts the login flow if the service restarts mid-auth.

---

## 3. API — Terminal Service (`server.js`)

Five new routes added to the existing Express app:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/claude-profiles` | List profiles + which is active |
| `POST` | `/claude-profiles/login/start` | Spawn `claude /login`, return auth URL |
| `POST` | `/claude-profiles/login/complete` | Feed code to CLI, save resulting profile |
| `POST` | `/claude-profiles/:name/activate` | Swap active credentials |
| `DELETE` | `/claude-profiles/:name` | Remove a profile |

### GET /claude-profiles
Returns:
```json
{
  "active": "work",
  "profiles": [
    { "name": "work", "addedAt": "2026-06-21T09:00:00.000Z" },
    { "name": "personal", "addedAt": "2026-06-20T14:00:00.000Z" }
  ]
}
```

### POST /claude-profiles/login/start
Body: `{ "name": "work" }`  
- Validates `name` matches `/^[a-zA-Z0-9_-]{1,20}$/`
- Rejects if a profile with that name already exists
- Spawns `claude /login` with `HOME=/home/dama` and captures stdout
- Scans stdout for the first line containing `https://` (the auth URL); if no URL appears within 30 seconds, kills the child and returns 500
- Stores the child process in an in-memory map keyed by a generated `sessionId`
- Sets a 5-minute timeout that kills the child if `login/complete` is never called
- Returns: `{ "sessionId": "abc123", "url": "https://claude.ai/..." }`

### POST /claude-profiles/login/complete
Body: `{ "sessionId": "abc123", "code": "..." }`  
- Looks up the pending child process by `sessionId`
- Writes `code + "\n"` to the child's stdin
- Waits for the process to exit (2-minute timeout)
- On success: reads updated `~/.claude/.credentials.json`, copies to `profiles/<name>.json`, updates `meta.json` with new profile and sets it as active
- Cleans up the in-memory entry
- Returns: `{ "ok": true }`
- On timeout/error: returns 500 with an error message

### POST /claude-profiles/:name/activate
- Validates name, checks profile file exists
- Copies `profiles/<name>.json` → `.credentials.json`
- Updates `meta.active = name`
- Returns: `{ "ok": true }`

### DELETE /claude-profiles/:name
- Validates name
- Removes `profiles/<name>.json`
- Removes entry from `meta.json`
- If it was the active profile, sets `meta.active = null`
- Does not touch `.credentials.json`
- Returns: `{ "ok": true }`

All routes require the same JWT auth check used by existing routes (`requireAuth`).

---

## 4. API — NestJS Backend (`terminal.controller.ts`)

Five proxy methods added to `TerminalController`, following the exact same pattern as the existing `getSessions`, `createSession`, `deleteSession` methods: forward the request (with `Authorization` header) to `http://terminal:7681` and relay the response.

New frontend API calls:
- `GET /api/terminal/claude-profiles`
- `POST /api/terminal/claude-profiles/login/start`
- `POST /api/terminal/claude-profiles/login/complete`
- `POST /api/terminal/claude-profiles/:name/activate`
- `DELETE /api/terminal/claude-profiles/:name`

---

## 5. UI

### Profile Button in TerminalBreadcrumb

The right side of `TerminalBreadcrumb` gains a profile button left of the existing "Change" button:

```
[ session > workspace > repo ]    [ work ▼ ]  [ Change ]
```

The button label is the active profile name, or `"no account"` if `meta.active` is null. Clicking opens a dropdown anchored below the button.

**Dropdown contents:**
- One row per profile: `✓ work` (checkmark on active), clicking calls activate then refreshes
- A `+ Add account` row at the bottom

### Profile Button in SessionManager

The same profile button (label + dropdown) is rendered in the top-right area of the `SessionManager` screen. This ensures the user can switch accounts without first opening a terminal session.

A shared `useClaudeProfiles` hook fetches the profile list and exposes `profiles`, `active`, `activate(name)`, and `startLogin(name)` / `completeLogin(sessionId, code)`. Both UI locations consume this hook.

### Add Account Modal

Opened from `+ Add account`. Three steps rendered as a single modal:

1. **Name field** — text input for the profile name (validated client-side: `/^[a-zA-Z0-9_-]{1,20}$/`). A "Get link" button calls `/login/start` and transitions to step 2.

2. **Auth URL** — displayed as a read-only text box with a "Copy" button. Instructions: "Open this link in a browser where you're logged into Claude, then paste the code below."

3. **Code field** — text input for the code the user copies from the browser. A "Verify" button calls `/login/complete`. Shows a spinner while waiting. On success, closes the modal. On error, shows the error message inline.

The modal can be dismissed at any time; if a login session was started but not completed, the backend child process times out and is cleaned up automatically after 5 minutes.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `terminal/src/server.js` | Add 5 new routes + `bootstrapActiveProfile()` startup call |
| `backend/src/terminal/terminal.controller.ts` | Add 5 proxy methods |
| `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx` | Add profile button + dropdown |
| `frontend/src/app/(app)/terminal/components/SessionManager.tsx` | Add profile button + dropdown |
| `frontend/src/app/(app)/terminal/components/AddAccountModal.tsx` | New component |
| `frontend/src/lib/hooks/useClaudeProfiles.ts` | New hook |

No new Docker volumes, no database migrations, no new npm packages needed.
