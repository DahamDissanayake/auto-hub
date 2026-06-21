# Files App — Design Spec

**Date:** 2026-06-21
**Status:** Approved

## Overview

A Google Drive-style file manager integrated into auto-hub. Users can browse, upload, download, create folders, rename, and delete files across two storage roots: the Pi's home/workspace directories (Internal Storage) and the mounted data drive (`/mnt/data`). A floating transfer tray shows real-time upload/download progress.

Implemented as a dedicated Docker container (`files`) with a lightweight Express API, a new Next.js page at `/files`, and a global transfer tray component.

---

## Architecture

```
Browser (Next.js /files page + global TransferTray)
         │ HTTP + SSE
         ▼
nginx
  /files-api/  →  files container :5050
  /api/        →  backend :4000
  /            →  frontend :3000
         │
         ▼
files container (Node.js + Express)
  • validates JWT (shared JWT_SECRET env var)
  • directory listing, mkdir, rename, delete
  • upload: busboy streaming → fs.createWriteStream (no full-file buffering)
  • download: fs.createReadStream piped to response
  • SSE: per-connection channel for transfer progress events

Volume mounts:
  /home/dama   → /roots/internal   (rw)
  /workspace   → /roots/workspace  (rw)
  /mnt/data    → /roots/data       (rw)
```

The files container is fully independent. Restarting it does not affect the main backend, frontend, or any other service.

---

## Storage Roots

| Root name   | Host path      | Container path      | Label in UI        |
|-------------|----------------|---------------------|--------------------|
| `internal`  | `/home/dama`   | `/roots/internal`   | Internal Storage   |
| `workspace` | `/workspace`   | `/roots/workspace`  | Workspace          |
| `data`      | `/mnt/data`    | `/roots/data`       | Data Drive         |

All API paths are relative to a named root. The service resolves them to absolute paths and enforces a path-traversal guard: every resolved path must start with the root's absolute path, or the request is rejected with `403`.

---

## API Endpoints

All endpoints require `Authorization: Bearer <jwt>`. JWT is validated using the shared `JWT_SECRET` environment variable.

| Method   | Path                                          | Description                        |
|----------|-----------------------------------------------|------------------------------------|
| `GET`    | `/files-api/ls?root=data&path=/photos`        | List directory contents            |
| `POST`   | `/files-api/mkdir`                            | `{ root, path }` — create folder   |
| `POST`   | `/files-api/rename`                           | `{ root, from, to }` — rename/move |
| `DELETE` | `/files-api/delete`                           | `{ root, path }` — delete file/dir |
| `GET`    | `/files-api/download?root=data&path=/file.zip`| Stream file to browser             |
| `POST`   | `/files-api/upload?root=data&path=/photos`    | Multipart stream via busboy        |
| `GET`    | `/files-api/events`                           | SSE stream — transfer progress     |

`ls` response shape:
```json
{
  "path": "/photos",
  "entries": [
    { "name": "cat.jpg", "type": "file", "size": 204800, "modified": "2026-06-20T10:00:00Z" },
    { "name": "vacation", "type": "dir", "size": 0, "modified": "2026-06-19T08:00:00Z" }
  ]
}
```

SSE event shape:
```json
{ "transferId": "abc123", "bytesWritten": 512000, "total": 2048000, "status": "uploading" }
{ "transferId": "abc123", "status": "done" }
{ "transferId": "abc123", "status": "error", "message": "Disk full" }
```

---

## Frontend Components

All files under `frontend/src/app/(app)/files/`.

### `page.tsx` — Files Page

- Left sidebar: three root drives as icon cards (Internal, Workspace, Data Drive)
- Right panel: current directory contents as grid (icon view) or list (name, size, modified)
- Toolbar: path breadcrumb, New Folder button, Upload button, view toggle (grid/list)
- Folder click: navigate into it
- File click: trigger download
- Right-click / long-press: context menu → Download, Rename, Delete
- No preview pane in v1

### `TransferTray.tsx` — Floating Transfer Panel

- Fixed bottom-right corner
- Collapsed to a small chip when idle; expands when a transfer starts or on hover
- Each transfer row: filename, direction (↑ upload / ↓ download), progress bar, speed (KB/s), status icon (spinner / ✓ / ✗)
- Subscribes to SSE stream (`/files-api/events`) for real-time byte counts
- State managed in a Zustand store (`transferStore`) so it persists across page navigation
- Transfers auto-dismiss from the tray 5 seconds after completion

### `useFiles.ts` — Data Hook

Wraps all API calls: `listDir`, `upload`, `download`, `mkdir`, `rename`, `deleteItem`.

- All calls attach JWT from `sessionStorage('autohub_token')`
- `upload` accepts a `File[]` and an `onProgress` callback; uses `fetch` with `FormData`; supports `AbortController` for cancellation
- `download` fetches the file, creates a temporary object URL, and triggers browser download via a hidden `<a>` tag
- On upload abort: partial server-side file is cleaned up; tray entry is removed

### App Registration

In `apps.config.ts`:
```ts
{
  id: 'files',
  name: 'Files',
  description: 'Browse, upload, and download files across internal storage and the data drive.',
  url: '/files',
  lucideIcon: 'FolderOpen',
  color: '#f59e0b',
}
```

Add to `INTERNAL_PAGES` in `apps/[id]/page.tsx` and add a sidebar nav entry.

---

## Files Container

**Directory:** `files/`

```
files/
  Dockerfile
  package.json
  src/
    index.ts          — Express app entry, JWT middleware, route registration
    routes/
      ls.ts
      upload.ts
      download.ts
      delete.ts
      mkdir.ts
      rename.ts
      events.ts       — SSE handler
    lib/
      resolvePath.ts  — path safety util
      auth.ts         — JWT validation middleware
      transferStore.ts — in-memory map of active transfers (per SSE connection)
```

**Stack:** Node.js 20-alpine, Express 4, `busboy` for multipart, `jsonwebtoken` for JWT validation.

**docker-compose.yml additions:**
```yaml
files:
  build: ./files
  environment:
    JWT_SECRET: ${JWT_SECRET}
    ROOTS_INTERNAL: /roots/internal
    ROOTS_WORKSPACE: /roots/workspace
    ROOTS_DATA: /roots/data
  volumes:
    - /home/dama:/roots/internal:rw
    - /workspace:/roots/workspace:rw
    - /mnt/data:/roots/data:rw
  restart: unless-stopped
```

**nginx addition:**
```nginx
location /files-api/ {
    set $files http://files:5050;
    rewrite ^/files-api/(.*)$ /$1 break;
    proxy_pass $files;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection '';  # SSE: disable chunked keep-alive upgrade
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

---

## Data Flow

### Upload
1. User picks files → `useFiles.upload()` POSTs to `/files-api/upload` with `FormData`
2. Tray entry added immediately (status: uploading)
3. busboy pipes each file part to `fs.createWriteStream` — no full-file buffering
4. On each busboy `data` chunk, server emits SSE `{ transferId, bytesWritten, total }`
5. Frontend SSE listener updates tray store → progress bar re-renders
6. On finish, server emits `{ transferId, status: 'done' }` → tray shows ✓

### Download
1. `useFiles.download()` GETs `/files-api/download`
2. Response streams to a `Blob` via `fetch`
3. Frontend creates `URL.createObjectURL(blob)`, triggers `<a>` click, revokes URL
4. Tray shows determinate bar using `Content-Length` header if available

### Cancel Upload
1. User clicks ✗ in tray → `AbortController.abort()` called
2. `fetch` rejects with `AbortError` → `useFiles` catches it, removes tray entry
3. Server-side: busboy stream destroyed on client disconnect; `fs.createWriteStream` closed and partial file deleted via `fs.unlink`

---

## Error Handling

| Scenario | HTTP status | Tray behavior |
|---|---|---|
| Path traversal attempt | 403 | — (logged server-side) |
| File/dir not found | 404 | ✗ "File not found" |
| Permission denied | 403 | ✗ "Permission denied" |
| Upload cancelled | — | Entry removed from tray |
| Disk full | 507 | ✗ "Not enough space" |
| JWT invalid/expired | 401 | Redirect to login |
| SSE disconnect | — | Client auto-reconnects via `EventSource` retry |

---

## Testing

| Layer | What | How |
|---|---|---|
| Unit | `resolveSafePath` | Normal paths, `..` traversal, symlink targets — 100% coverage required |
| Integration | All API endpoints | Against a temp directory fixture; no mocking |
| Frontend | `useFiles` hook | `msw` intercepting fetch |
| Frontend | Tray store | State transitions: idle → uploading → done → error |
| E2E | — | Out of scope v1; manual verification via running app |

---

## Out of Scope (v1)

- File preview (images, text, PDF)
- Drag-and-drop upload
- Multi-select operations
- Folder download as zip
- Sharing / public links
- Search
