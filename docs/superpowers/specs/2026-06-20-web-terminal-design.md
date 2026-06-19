# Web Terminal (Sub-system 1) Design Spec

**Date:** 2026-06-20
**Status:** Approved

## Goal

Add a "Claude Code Terminal" card to the AutoHub Apps launcher that opens a browser-based terminal on the Raspberry Pi. The terminal must work comfortably on both mobile and desktop and support dynamic working-directory selection so an external SSD (to be added later as Sub-system 2) can be set as the working location without code changes.

## Scope

This spec covers Sub-system 1 only: the terminal WebSocket service, the directory picker, and the in-browser terminal UI. USB SSD mount management is deferred to Sub-system 2.

---

## Architecture

```
Browser (AutoHub /terminal page)
  │
  ├── HTTP  GET /api/terminal/dirs  →  NestJS backend
  │                                     reads TERMINAL_DIRS env var
  │
  └── WebSocket  /terminal-ws/?cwd=/workspace/home&token=<jwt>
        │
       nginx  →  terminal:7681  →  node-pty → bash (in selected cwd)
                 (Docker container with host bind mounts)
```

Four components:

1. **`terminal/` Docker service** — Node.js WebSocket PTY bridge. No frontend of its own.
2. **NestJS `TerminalModule`** — `GET /api/terminal/dirs` endpoint, JWT-protected.
3. **`/terminal` Next.js page** — directory picker modal + xterm.js terminal with mobile toolbar.
4. **Nginx `/terminal-ws/` location** — WebSocket-aware proxy to the terminal container.

---

## Component 1: Terminal Docker Service

### Directory layout

```
terminal/
  Dockerfile
  package.json
  src/
    server.js
```

### Dockerfile

Base: `node:20-alpine`. Must install native build tools (`python3 make g++`) before `npm install` because `node-pty` compiles a native binding.

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ ./src/
EXPOSE 7681
CMD ["node", "src/server.js"]
```

### Dependencies (`package.json`)

```json
{
  "dependencies": {
    "express": "^4.19.0",
    "ws": "^8.17.0",
    "node-pty": "^1.0.0",
    "jsonwebtoken": "^9.0.0"
  }
}
```

### `src/server.js` behaviour

**Startup:** Read env vars `JWT_SECRET` (required, fatal if missing) and `TERMINAL_DIRS` (comma-separated list of allowed absolute paths, e.g. `/workspace/home,/workspace/repo`). Build an `allowedDirs` Set from them.

**HTTP server (Express on port 7681):**
- `GET /health` → `{ status: 'ok' }` (Docker healthcheck)

**WebSocket server (attached to the same HTTP server):**

On `connection` event:
1. Parse `?token=<jwt>` from the request URL. Reject (`ws.close(4401, 'Unauthorized')`) if missing or if `jwt.verify(token, JWT_SECRET)` throws.
2. Parse `?cwd=<path>`. Reject (`ws.close(4400, 'Bad cwd')`) if missing or if the path is not in `allowedDirs`.
3. Spawn PTY:
   ```js
   const pty = nodePty.spawn('bash', [], {
     name: 'xterm-256color',
     cwd,
     env: { ...process.env, TERM: 'xterm-256color' },
     cols: 80,
     rows: 24,
   });
   ```
4. `pty.onData(data => ws.send(data))` — forward PTY output to browser.
5. `ws.on('message', msg => { ... })`:
   - If `msg` is valid JSON with `type: 'resize'`, call `pty.resize(msg.cols, msg.rows)`.
   - Otherwise write raw string to PTY: `pty.write(msg)`.
6. `pty.onExit(() => ws.close(1000, 'Process exited'))`.
7. `ws.on('close', () => pty.kill())`.

**Error handling:** Wrap spawn in try/catch; on failure `ws.close(4500, 'Spawn failed')`.

### docker-compose.yml additions

```yaml
terminal:
  build: ./terminal
  environment:
    JWT_SECRET: ${JWT_SECRET}
    TERMINAL_DIRS: /workspace/home,/workspace/repo
  volumes:
    - /home/dama:/workspace/home:rw
    - /home/dama/repo/auto-hub:/workspace/repo:rw
  restart: unless-stopped
```

Add `terminal` to nginx's `depends_on` list.

**Adding future SSD (Sub-system 2):** Add a bind mount entry and append the path to `TERMINAL_DIRS`. No code changes required.

---

## Component 2: NestJS TerminalModule

### Files

- `backend/src/terminal/terminal.module.ts`
- `backend/src/terminal/terminal.controller.ts`
- Register in `backend/src/app.module.ts`

### Endpoint

```
GET /api/terminal/dirs
Authorization: Bearer <jwt>   (JwtAuthGuard — global, no extra annotation needed)
```

**Response:**
```json
[
  { "label": "Home", "path": "/workspace/home" },
  { "label": "AutoHub Repo", "path": "/workspace/repo" }
]
```

**Implementation:** Read `process.env.TERMINAL_DIRS` (comma-separated paths). For each path, derive a human label:
- `/workspace/home` → `"Home"`
- `/workspace/repo` → `"AutoHub Repo"`
- Unknown paths → use the last path segment as the label

The label mapping is defined as a const object in the controller — no database, no config file.

---

## Component 3: `/terminal` Next.js Page

### File

`frontend/src/app/(app)/terminal/page.tsx`

### Page flow

1. **Mount:** fetch `GET /api/terminal/dirs`. Show loading skeleton while pending.
2. **Directory picker modal:** full-screen overlay (same `bg-[#1a1a1a]` + `border border-[#2a2a2a]` palette as other modals). Lists available directories as clickable cards. Each card shows the label and the path. No "cancel" — must pick one. Selection persists in `localStorage` under the key `terminal.lastCwd` so subsequent visits skip the modal.
3. **Terminal view:** once a directory is selected, unmount the modal and mount the xterm.js terminal.

### xterm.js integration

Use dynamic import (browser-only):
```ts
const { Terminal } = await import('@xterm/xterm')
const { FitAddon } = await import('@xterm/addon-fit')
```

Terminal options:
```ts
{
  fontSize: isMobile ? 15 : 12,
  fontFamily: 'Menlo, "DejaVu Sans Mono", monospace',
  theme: {
    background: '#0d0d0d',
    foreground: '#e5e7eb',
    cursor: '#3b82f6',
  },
  cursorBlink: true,
  scrollback: 5000,
}
```

`isMobile`: `window.innerWidth < 768 || navigator.maxTouchPoints > 0`

**WebSocket connection:**
```ts
const token = sessionStorage.getItem('autohub_token') ?? ''
const ws = new WebSocket(`${wsBase}/terminal-ws/?cwd=${encodeURIComponent(cwd)}&token=${token}`)
ws.onmessage = e => term.write(e.data)
term.onData(data => ws.send(data))
```

`wsBase`: derive from `window.location` — same host, swap `https` → `wss` (or `http` → `ws`).

**Resize handling:**
```ts
const fit = () => {
  fitAddon.fit()
  ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
}
window.addEventListener('resize', fit)
// iOS/Android keyboard open/close
window.visualViewport?.addEventListener('resize', fit)
```

**Cleanup:** on page unmount, `ws.close()`, `term.dispose()`, remove event listeners.

### Mobile keyboard toolbar

Rendered only when `isMobile`. A sticky `div` immediately above the terminal container:

```
[ Tab ] [ Ctrl+C ] [ Ctrl+D ] [ Esc ] [ ↑ ] [ ↓ ] [ ← ] [ →  ]
```

Style: `h-10 flex gap-1 px-2 items-center bg-[#1a1a1a] border-b border-[#2a2a2a] overflow-x-auto`

Each button: `px-3 py-1 rounded text-xs font-mono bg-[#2a2a2a] text-[#e5e7eb] active:bg-[#3b82f6] select-none`

Key sequences sent on tap:
| Button | Sequence |
|--------|----------|
| Tab | `\t` |
| Ctrl+C | `\x03` |
| Ctrl+D | `\x04` |
| Esc | `\x1b` |
| ↑ | `\x1b[A` |
| ↓ | `\x1b[B` |
| ← | `\x1b[D` |
| → | `\x1b[C` |

### Layout

```
<full-height flex-col>
  [mobile only] keyboard toolbar (h-10, sticky top)
  xterm container (flex-1, overflow hidden)
</full-height>
```

The terminal container must have explicit pixel dimensions for xterm.js to render correctly — use a `ResizeObserver` or `useEffect` after mount to set `width/height` before calling `fitAddon.fit()`.

### Connection error states

- WebSocket `onerror` or close code `4401`: show "Authentication failed. Please log in again."
- Close code `4400`: show "Invalid working directory."
- Close code `4500`: show "Failed to start terminal. Is the terminal service running?"
- Normal process exit (code `1000`): show "Session ended." with a "Reconnect" button that re-mounts the page.

### Package additions

```
@xterm/xterm
@xterm/addon-fit
```

---

## Component 4: Nginx Routing

Add this location block to `nginx/nginx.conf`, before the catch-all `location /`:

```nginx
location /terminal-ws/ {
    set $terminal http://terminal:7681;
    rewrite ^/terminal-ws/(.*)$ /$1 break;
    proxy_pass $terminal;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 86400s;
}
```

No Basic Auth on this location — the terminal service validates the JWT directly, which is more WebSocket-friendly than HTTP Basic Auth (browsers cannot send Basic Auth headers with `new WebSocket()`).

---

## Component 5: Apps Config & Apps Page Update

### `apps.config.ts`

Add one entry:
```ts
{
  id: 'claude-terminal',
  name: 'Claude Code Terminal',
  description: 'Browser terminal with Claude Code on the Raspberry Pi',
  url: '/terminal',
  color: '#10b981',
}
```

### Apps page card renderer

The current renderer uses `<a href={app.url} target="_blank">` for all cards. Add a branch:

```tsx
if (app.url.startsWith('/')) {
  // internal AutoHub route — open in same tab
  return <Link href={app.url}>...</Link>
}
// external URL — open in new tab (existing behaviour)
return <a href={app.url} target="_blank" rel="noopener noreferrer">...</a>
```

---

## Auth Flow Summary

| Layer | Mechanism |
|-------|-----------|
| AutoHub `/terminal` page | Existing Next.js JWT middleware — redirects to login if unauthenticated |
| `GET /api/terminal/dirs` | NestJS `JwtAuthGuard` (global) |
| WebSocket `/terminal-ws/` | Terminal service validates `?token=<jwt>` with `jsonwebtoken.verify()` using shared `JWT_SECRET` |

The JWT is stored in `sessionStorage` under the key `autohub_token` (same as all other API calls in `frontend/src/lib/api.ts`). The frontend reads it with `sessionStorage.getItem('autohub_token')` when building the WebSocket URL.

---

## Future: Adding the SSD (Sub-system 2)

When the SSD is mounted at e.g. `/mnt/ssd`:

1. Add to `docker-compose.yml`:
   ```yaml
   - /mnt/ssd:/workspace/ssd:rw
   ```
2. Append `/workspace/ssd` to `TERMINAL_DIRS`.
3. Add label mapping in the controller: `/workspace/ssd` → `"SSD"`.

No other code changes. The directory picker will automatically show the new option on next container restart.

---

## Non-Goals (this spec)

- USB drive detection or auto-mounting (Sub-system 2)
- Multiple simultaneous terminal sessions per page (one session per page load)
- Terminal session persistence / reconnect after network drop (future enhancement)
- Terminal sharing / collaboration
