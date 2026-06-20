# Host Control Plugin Design

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

A single plugin — `host-control` — that lets the user safely reboot or shut down the Raspberry Pi host from the auto-hub Plugins page. Both actions are gated behind a password confirmation modal (the admin dashboard password), and execute via the Docker socket already mounted into the backend container.

---

## Architecture

```
[Reboot button] or [Shutdown button]
        │
        ▼
ActionConfirmModal (frontend)
  - action name + password input
        │
        ▼
POST /api/plugins/:id/run  { action: 'reboot' | 'shutdown', password: '...' }
        │
        ▼
PluginsController
  - looks up plugin (requiresPassword: true)
  - validates password vs ADMIN_PASSWORD env var → 403 if wrong
        │
        ▼
PluginsService.run(id, 'manual', action)
  - passes { config, log, action } to plugin fn
        │
        ▼
host-control/index.js
  - calls Docker API via Unix socket (/var/run/docker.sock)
  - POST /containers/create  (alpine, privileged, --pid=host)
  - POST /containers/{id}/start
  - POST /containers/{id}/wait
  - DELETE /containers/{id}
  - nsenter -t 1 -m -u -i -n -- reboot | poweroff
```

---

## Plugin Files

### `/app/plugins/host-control/manifest.json`

```json
{
  "slug": "host-control",
  "name": "Host Control",
  "description": "Safely reboot or shut down the Raspberry Pi host",
  "version": "1.0.0",
  "category": "ops",
  "icon": "⚡",
  "entryFile": "index.js",
  "requiresPassword": true,
  "actions": [
    { "key": "reboot",   "label": "Reboot",   "danger": true },
    { "key": "shutdown", "label": "Shutdown",  "danger": true }
  ],
  "configSchema": []
}
```

### `/app/plugins/host-control/index.js`

Calls the Docker HTTP API directly through the Unix socket using Node's built-in `http` module (no docker CLI or extra npm packages needed). Flow:

1. `POST /containers/create` — alpine image, `Privileged: true`, `PidMode: "host"`, Cmd: `["nsenter", "-t", "1", "-m", "-u", "-i", "-n", "--", action === 'shutdown' ? 'poweroff' : 'reboot']`
2. `POST /containers/{id}/start`
3. `POST /containers/{id}/wait` — waits for container exit
4. `DELETE /containers/{id}?force=true` — cleanup
5. Logs each step via `log()`

---

## Backend Changes

### `docker-compose.yml` — backend service

Add Docker socket mount (read-write required so backend can create containers):

```yaml
backend:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

Group add for Docker socket GID (984):

```yaml
backend:
  group_add:
    - "984"
```

### `Plugin` entity — two new columns

```typescript
@Column({ type: 'jsonb', default: [] })
actions: { key: string; label: string; danger?: boolean }[];

@Column({ default: false })
requiresPassword: boolean;
```

### `PluginsService.upsertFromManifest()`

Read `actions` and `requiresPassword` from manifest, persist to DB.

### `PluginsService.run()`

Signature change: `run(id, triggeredBy, action?: string)` — passes `action` into the plugin fn context: `fn({ config, log, action })`.

### `PluginsController` — `POST :id/run`

Accepts optional body `{ action?: string, password?: string }`.

If `plugin.requiresPassword`:
- Compare `body.password` against `process.env.ADMIN_PASSWORD`
- Return `403 { error: 'Invalid password' }` if wrong
- Proceed if correct

---

## Frontend Changes

### `types.ts` — `Plugin` interface additions

```typescript
actions: { key: string; label: string; danger?: boolean }[]
requiresPassword: boolean
```

### `PluginCard.tsx`

When `plugin.actions.length > 0`: render one button per action instead of the "Run now" button.
- Danger actions: red button style (`bg-[#ef4444] hover:bg-[#dc2626]`)
- Non-danger actions: blue button style (existing "Run now" style)
- Clicking any action button opens `ActionConfirmModal` with that action

### New `ActionConfirmModal.tsx`

A modal with:
- Heading: `{action.label} Pi?` (e.g. "Reboot Pi?")
- Warning text: e.g. "This will immediately restart the host. All active terminal sessions will be lost."
- Password input (type="password", placeholder="Dashboard password")
- "Cancel" button + `{action.label}` confirm button (red if danger)
- On confirm: `POST /api/plugins/:id/run` with `{ action: action.key, password }`
- On 403: show inline error "Wrong password"
- On success: toast "Reboot command sent"

### `useRunPlugin` hook

Extend to accept optional `{ action?: string, password?: string }` in `mutateAsync()` call body.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Wrong password | 403 → inline error in modal "Wrong password" |
| Docker socket not mounted | plugin logs error, execution marked failed |
| alpine image not pulled | Docker pull happens automatically on create |
| Host already rebooting | Docker API returns error → execution marked failed |

---

## Out of Scope

- Scheduled reboot/shutdown
- Delayed reboot (e.g. "in 5 minutes")
- Reboot reason/message
- Per-user permission checks (single-user dashboard)
