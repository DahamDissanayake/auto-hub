# AutoHub — Design Specification
**Date:** 2026-06-18  
**Status:** Approved  
**Approach:** Backend-first sequential (Approach A)

---

## 1. Overview

AutoHub is an open-source, self-hosted personal automation OS designed to run on a Raspberry Pi 5. It is a single-user application accessible from anywhere via a custom domain using Cloudflare Zero Trust tunneling. The entire stack runs in Docker Compose and is installable with one command.

**Key constraints:**
- Single user — no multi-tenancy, no user table
- ARM64-compatible (Pi 5 target), Linux only
- All 7 services run in Docker Compose
- Code is written on Windows, transferred to Linux for testing

---

## 2. Project Structure

```
autohub/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── dev-logs/
│   └── testings.md              ← test runbook for Linux machine
├── nginx/
│   └── nginx.conf
├── scripts/
│   └── install.sh
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── health/
│       ├── auth/
│       ├── dashboard/
│       ├── plugins/
│       ├── scheduler/
│       ├── n8n/
│       ├── notifications/
│       └── seed.ts
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.ts
    └── src/
        ├── app/
        ├── components/
        └── lib/
```

---

## 3. Infrastructure

### Docker Compose Services (7 total)

| Service | Image | Internal Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | ARM64-native |
| `redis` | `redis:7-alpine` | 6379 | ARM64-native |
| `n8n` | `n8nio/n8n:latest` | 5678 | Path prefix `/n8n` |
| `backend` | local build | 4000 | NestJS, depends on postgres + redis |
| `frontend` | local build | 3000 | Next.js production build |
| `nginx` | `nginx:alpine` | 80 (host) | Routes all traffic |
| `cloudflared` | `cloudflare/cloudflared:latest` | — | Internet tunnel |

### Nginx Routing
- `/api/*` → `backend:4000`
- `/n8n/*` → `n8n:5678`
- `/*` → `frontend:3000`

### Environment Variables (`.env.example`)

```env
DOMAIN=yourdomain.com
ADMIN_PASSWORD=changeme
JWT_SECRET=change-this-secret
POSTGRES_PASSWORD=dbpassword
TELEGRAM_BOT_TOKEN=          # autohub-serenedge bot token
TELEGRAM_CHAT_ID=            # your personal chat ID
N8N_API_KEY=                 # set after first n8n boot
CLOUDFLARE_TUNNEL_TOKEN=     # from Cloudflare Zero Trust dashboard
TIMEZONE=UTC
PLUGIN_DIR=/app/plugins
```

### Dockerfiles
Both use `node:20-alpine` multi-stage builds. ARM64-compatible — no native binary packages.

---

## 4. Backend Architecture

### Tech Stack
- NestJS 10, TypeScript, TypeORM, PostgreSQL 16
- BullMQ + Redis 7 for job queues
- `@nestjs/config`, `@nestjs/axios`, `@nestjs/jwt`, `@nestjs/passport`
- `node-telegram-bot-api` for Telegram notifications

### Module Map

```
AppModule
├── ConfigModule (global)
├── TypeOrmModule (PostgreSQL, auto-migrate)
├── BullModule (Redis)
├── HealthModule          ← GET /api/health (public)
├── AuthModule            ← POST /api/auth/login
├── PluginsModule         ← /api/plugins/*
├── SchedulerModule       ← /api/schedules/*
├── DashboardModule       ← /api/dashboard, /api/dashboard/calendar
├── N8nModule             ← /api/n8n/*
└── NotificationsModule   ← Telegram bot: autohub-serenedge
```

### Auth
- `POST /api/auth/login` — accepts `{ password: string }`, compares against `ADMIN_PASSWORD` env var (bcrypt), returns `{ access_token }` (JWT, 7-day expiry)
- JWT payload: `{ sub: "admin" }`
- `JwtAuthGuard` applied globally via `APP_GUARD`
- `HealthController` and `AuthController` are decorated with `@Public()` to bypass the guard
- No user table — single hardcoded admin

### Plugin System

**Entities:**
- `Plugin` — id (uuid), slug, name, description, icon, category, version, entryFile, status (`active`|`inactive`|`error`), config (jsonb), configSchema (jsonb), lastRunAt, lastRunStatus, createdAt, updatedAt
- `PluginExecution` — id, pluginId, status (`running`|`success`|`failed`), output, error, triggeredBy (`manual`|`scheduled`), durationMs, startedAt, finishedAt

**Plugin folder structure:**
```
PLUGIN_DIR/
  <slug>/
    index.js        ← exports default async function({ config, log })
    manifest.json   ← metadata + configSchema
```

**Auto-scan on startup (`OnModuleInit`):**  
`PluginsService` scans `PLUGIN_DIR`, reads every `manifest.json`, upserts into `plugins` table. New plugins inserted as `inactive`. Existing plugins have metadata updated; `status` and `config` are preserved.

**Execution model:**  
`POST /api/plugins/:id/run` loads `index.js` via `require()`, calls the exported function with `{ config, log }`. Log output captured in a string buffer. A `PluginExecution` row is created with `status: "running"` before execution, updated to `"success"` or `"failed"` on resolution. Timeout: 60 seconds. Triggers Telegram notification on completion.

**Endpoints:**
- `GET /api/plugins` — list all plugins
- `POST /api/plugins/register` — manual register from manifest (**must be declared before `/:id` routes in the controller to avoid NestJS matching "register" as an id**)
- `GET /api/plugins/:id` — single plugin
- `POST /api/plugins/:id/run` — run immediately
- `PATCH /api/plugins/:id/config` — update config `{ config: {} }`
- `POST /api/plugins/:id/toggle` — toggle active/inactive
- `GET /api/plugins/:id/executions` — execution history

### Scheduler

**Entity:** `ScheduledJob` — id, pluginId, name, cron, enabled, nextRunAt, lastRunAt, createdAt

**Behavior:**
- `POST /api/schedules` — creates DB row + registers BullMQ repeatable job
- `DELETE /api/schedules/:id` — removes row + cancels BullMQ job
- `PATCH /api/schedules/:id/toggle` — pauses/resumes BullMQ job, updates `enabled`
- `SchedulerService.onModuleInit()` — re-registers all enabled schedules from DB on boot (survives `docker compose restart`)

**Endpoints:**
- `GET /api/schedules`
- `POST /api/schedules` — body: `{ pluginId, name, cron }`
- `DELETE /api/schedules/:id`
- `PATCH /api/schedules/:id/toggle`

### Dashboard

**`GET /api/dashboard`** returns:
```typescript
{
  stats: {
    totalPlugins, activePlugins, errorPlugins,
    activeSchedules, totalSchedules,
    n8nWorkflows, recentSuccessRuns, recentFailedRuns
  },
  recentActivity: PluginExecution[],   // last 20
  upcomingSchedules: ScheduledJob[],   // next 5 by nextRunAt
  n8nWorkflows: N8nWorkflow[],
  plugins: Plugin[]
}
```

**`GET /api/dashboard/calendar`** returns plugin schedules + active n8n workflows for calendar rendering.

### n8n Bridge

- All calls proxy to `http://n8n:5678/api/v1/` via `@nestjs/axios` with `X-N8N-API-KEY` header
- If `N8N_API_KEY` is empty, all endpoints return `503` with `{ message: "N8N_API_KEY not configured" }`
- No caching — n8n is the source of truth

**Endpoints:**
- `GET /api/n8n/workflows`
- `GET /api/n8n/workflows/:id`
- `POST /api/n8n/workflows/:id/activate`
- `POST /api/n8n/workflows/:id/deactivate`
- `GET /api/n8n/executions`

### Notifications — Telegram bot: `autohub-serenedge`

- Package: `node-telegram-bot-api`
- `NotificationsService.send(message: string)` — fire-and-forget, logs error if unreachable
- Called by `PluginsService` after every execution:
  - Success: `✅ [PluginName] ran successfully (Xms)`
  - Failure: `❌ [PluginName] failed: {error}`
- If `TELEGRAM_BOT_TOKEN` is unset, `send()` is a no-op

### Health Endpoint

`GET /api/health` (no auth):
```json
{
  "status": "ok",
  "version": "1.0.0",
  "nodeVersion": "v20.x.x",
  "timezone": "UTC",
  "pluginDir": "/app/plugins",
  "telegramConfigured": true,
  "n8nConfigured": false
}
```

### Seed Script (`src/seed.ts`)

Writes 3 plugin folders to `PLUGIN_DIR`. Runs during the Docker entrypoint **before** the NestJS app boots: `node dist/seed.js && node dist/main.js`. This ensures the plugin files exist on disk before `PluginsService.onModuleInit()` scans them. The script is idempotent — it skips folders that already exist.

| Slug | Name | Icon | Category | Config schema |
|---|---|---|---|---|
| `daily-summary` | Daily Summary | 📋 | productivity | `{ title: string }` |
| `system-health` | System Health | 🖥️ | ops | none |
| `webhook-ping` | Webhook Ping | 🔔 | utility | `{ url: string, label: string }` |

`system-health` reads `/proc/loadavg` and `/proc/meminfo` — works natively on Pi/Linux.

---

## 5. Frontend Architecture

### Tech Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- `@tanstack/react-query`, `axios`, `lucide-react`, `date-fns`
- No external UI component libraries — all components built from scratch

### Design Tokens

| Token | Value |
|---|---|
| Background | `#0a0a0a` |
| Surface | `#111111` |
| Card | `#1a1a1a` |
| Border | `#2a2a2a` |
| Accent | `#3b82f6` (blue-500) |
| Success | `#22c55e` (green-500) |
| Error | `#ef4444` (red-500) |
| Warning | `#f59e0b` (amber-500) |
| Text primary | `#f1f1f1` |
| Text secondary | `#9ca3af` |
| Text muted | `#6b7280` |

Radius: `rounded-lg` for cards, `rounded-md` for inputs/buttons. No gradients, no blur. Flat dark surfaces.

### Routing

```
src/app/
├── (auth)/login/page.tsx        ← public, no AppShell
└── (app)/
    ├── layout.tsx               ← AppShell (JWT check + redirect)
    ├── page.tsx                 ← / Dashboard
    ├── plugins/page.tsx
    ├── schedules/page.tsx
    ├── calendar/page.tsx
    ├── n8n-workflows/page.tsx
    └── settings/page.tsx
```

### Component Tree

```
components/
├── layout/
│   ├── AppShell.tsx     ← JWT check, redirect to /login if missing
│   └── Sidebar.tsx      ← nav links (lucide-react icons), logo, logout
├── ui/
│   ├── StatCard.tsx     ← label + value + icon + optional accent color
│   ├── StatusBadge.tsx  ← colored pill: success/failed/running/active/inactive/error
│   ├── Toast.tsx        ← bottom-right toasts, auto-dismiss 4s, useToast() hook
│   └── Modal.tsx        ← generic modal: isOpen, onClose, title, children
└── plugins/
    ├── PluginCard.tsx   ← full card with run/configure/schedule/toggle
    ├── ConfigModal.tsx  ← dynamic form rendered from configSchema
    └── ScheduleModal.tsx ← cron presets + human-readable preview
```

### Data Layer

**`lib/api.ts`** — single Axios instance:
- `baseURL`: `process.env.NEXT_PUBLIC_API_URL`
- Request interceptor: attaches `Authorization: Bearer <token>` from `localStorage`
- Response interceptor: on 401 → clears `autohub_token`, redirects to `/login`
- All API calls go through this instance — no bare `fetch()` in components

**React Query hooks (`lib/hooks/`):**

| Hook | Endpoint | Refetch interval |
|---|---|---|
| `useDashboard` | `GET /api/dashboard` | 30s |
| `usePlugins` | `GET /api/plugins` | — |
| `usePlugin(id)` | `GET /api/plugins/:id` | — |
| `useExecutions(id)` | `GET /api/plugins/:id/executions` | — |
| `useSchedules` | `GET /api/schedules` | — |
| `useN8nWorkflows` | `GET /api/n8n/workflows` | — |
| `useHealth` | `GET /api/health` | — |

Mutations use `useMutation` + `queryClient.invalidateQueries` on success.

### Page Designs

#### `/login`
- Full-screen centered card, dark background
- `⚡ AutoHub` logo, password input, Login button
- `POST /api/auth/login` → store JWT as `autohub_token` in `localStorage` → redirect `/`
- Inline error on invalid password

#### `/` — Dashboard
- 4 stat cards: Total Plugins, Active Schedules, n8n Workflows, Failed Runs (red accent if > 0)
- Recent activity feed: status badge, triggered-by, time-ago (date-fns), duration
- Right column: upcoming schedules with inline toggle
- Bottom strip: n8n workflow cards with activate/deactivate and "Open in n8n" link
- Auto-refreshes every 30s via `useDashboard` refetch interval

#### `/plugins`
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` card grid
- Each card: icon, name, category badge, description, status dot, last run time, Run Now button, Configure button (if configSchema.length > 0), Schedule button, toggle
- Run Now: loading state → wait for execution → toast (success green / error red)
- Config modal: dynamic form from configSchema, secret fields use `type=password`
- Schedule modal: name + cron input + presets + human-readable preview

#### `/schedules`
- Table: Name | Plugin | Cron | Human readable | Status | Last run | Next run | Actions
- Inline status toggle, delete with confirmation dialog
- "Add Schedule" button (top right) opens ScheduleModal
- Empty state: "No schedules yet. Go to Plugins and schedule one."

#### `/calendar`
- Month view built with date-fns, no external calendar library
- Prev/Next month navigation, today highlighted
- Blue dots for plugin schedules, purple dots for n8n workflows
- Click day → popover listing automations that day
- Cron expansion: handles `* * * * *`, `0 9 * * *`, `0 9 * * 1`, `0 9 1 * *`, `*/N * * * *`, `0 */N * * *`, `0 9 * * 1-5`; everything else → "recurring"

#### `/n8n-workflows`
- Grid of workflow cards: name, status badge + toggle, "Open in n8n editor" button
- Info banner: "n8n is fully accessible at /n8n"
- Graceful error if N8N_API_KEY not set: setup instructions inline

#### `/settings`
- Read-only sections: System Info, Notifications (Telegram configured badge), Plugin Directory, n8n status, Danger Zone
- Fetches `GET /api/health` for live values
- No secrets exposed in UI

### Cron Human-Readable Converter (`lib/utils/cron.ts`)

```
* * * * *         → "Every minute"
0 * * * *         → "Every hour"
0 9 * * *         → "Every day at 9:00 AM"
0 9 * * 1         → "Every Monday at 9:00 AM"
0 9 1 * *         → "On the 1st of every month at 9:00 AM"
0 9 * * 1-5       → "Weekdays at 9:00 AM"
*/5 * * * *       → "Every 5 minutes"
0 */6 * * *       → "Every 6 hours"
(anything else)   → "Custom schedule (`{cron}`)"
```

### API Base URL

`NEXT_PUBLIC_API_URL` is baked at build time in Next.js. For production Docker (browser calls through Nginx on the same domain), leave it **unset** — Axios will use relative paths like `/api/...` which Nginx proxies to the backend. For local development outside Docker, set `NEXT_PUBLIC_API_URL=http://localhost:4000`. The Axios instance defaults to `''` (empty string) when the env var is absent, producing relative URLs.

### Frontend Dockerfile

Multi-stage: `node:20-alpine` builder + `node:20-alpine` production. Uses `dumb-init`. `NEXT_PUBLIC_API_URL` is left unset in docker-compose (relative paths work through Nginx); for standalone dev set it to `http://localhost:4000`.

---

## 6. Testing Architecture

### Strategy
Tests are written as part of the build. All tests run on the Linux/Pi target machine. `dev-logs/testings.md` is the complete runbook with every command and expected output.

### Backend Tests (Jest, built into NestJS)

**Unit tests** (mocked dependencies):

| File | Coverage |
|---|---|
| `auth.service.spec.ts` | Password compare, JWT generation, invalid password rejection |
| `plugins.service.spec.ts` | Manifest scan, upsert, run execution, 60s timeout |
| `scheduler.service.spec.ts` | Create registers BullMQ job, delete cancels, toggle pauses/resumes |
| `dashboard.service.spec.ts` | Stat aggregation counts, calendar cron expansion |
| `n8n.service.spec.ts` | Header proxying, 503 when key missing |
| `notifications.service.spec.ts` | No-op when token unset, sends when set |

**E2E tests** (real PostgreSQL test database):

| Scenario | Endpoint |
|---|---|
| Correct password returns JWT | `POST /api/auth/login` |
| Wrong password returns 401 | `POST /api/auth/login` |
| No token returns 401 | `GET /api/dashboard` |
| Valid token returns 200 | `GET /api/dashboard` |
| Health needs no token | `GET /api/health` |
| Seed plugins auto-registered | `GET /api/plugins` |
| Run plugin creates execution | `POST /api/plugins/:id/run` |
| Create schedule persists | `POST /api/schedules` |
| Toggle updates enabled state | `PATCH /api/schedules/:id/toggle` |
| n8n returns 503 when key unset | `GET /api/n8n/workflows` |

### Frontend Tests (Vitest + React Testing Library)

**Component tests:**

| File | Coverage |
|---|---|
| `StatusBadge.test.tsx` | Correct color class per status variant |
| `StatCard.test.tsx` | Renders label, value, icon; red accent when passed |
| `Toast.test.tsx` | Appears on `toast.success()`, auto-dismisses after 4s |
| `Modal.test.tsx` | Renders children when open, hidden when closed, onClose fires |
| `PluginCard.test.tsx` | Shows plugin data, Run button triggers mutation, toggle calls API |
| `ConfigModal.test.tsx` | Inputs from configSchema, secret fields use type=password |
| `ScheduleModal.test.tsx` | Preset updates cron, human-readable preview updates |
| `Sidebar.test.tsx` | Active link highlighted, logout clears localStorage |

**Hook tests:**

| File | Coverage |
|---|---|
| `useDashboard.test.ts` | Fetches data, refetches every 30s, handles 401 redirect |
| `usePlugins.test.ts` | List, run mutation invalidates query, toggle updates state |

### Integration Smoke Test (manual, in testings.md)

Step-by-step checklist run after `docker compose up --build` matching the Definition of Done exactly.

---

## 7. Build Order

1. Infrastructure files — `docker-compose.yml`, `.env.example`, `nginx/nginx.conf`, `scripts/install.sh`, `.gitignore`, `README.md`
2. Backend: `package.json`, `tsconfig.json`, `nest-cli.json`, `Dockerfile`
3. Backend: `main.ts`, `app.module.ts`
4. Backend: `health/` module
5. Backend: `auth/` module
6. Backend: `notifications/` module (Telegram bot: autohub-serenedge)
7. Backend: `plugins/` module (entities, service, controller, auto-scan)
8. Backend: `scheduler/` module
9. Backend: `n8n/` module
10. Backend: `dashboard/` module
11. Backend: `seed.ts` — writes 3 example plugin folders
12. Backend: unit tests (`*.spec.ts`)
13. Backend: e2e tests (`test/app.e2e-spec.ts`)
14. Frontend: scaffold via `create-next-app`, install extra packages
15. Frontend: `next.config.ts`, `tailwind.config.ts`, `Dockerfile`
16. Frontend: `lib/api.ts`
17. Frontend: `lib/utils/cron.ts`
18. Frontend: shared hooks (`lib/hooks/`)
19. Frontend: UI components (`components/ui/`)
20. Frontend: layout components (`components/layout/`)
21. Frontend: plugin components (`components/plugins/`)
22. Frontend: `/login` page
23. Frontend: `/` dashboard page
24. Frontend: `/plugins` page
25. Frontend: `/schedules` page
26. Frontend: `/calendar` page
27. Frontend: `/n8n-workflows` page
28. Frontend: `/settings` page
29. Frontend: component tests
30. Frontend: hook tests
31. `dev-logs/testings.md` — complete test runbook

---

## 8. Definition of Done

- [ ] `docker compose up --build` starts all 7 services without errors
- [ ] Visiting `http://localhost` shows the AutoHub login page
- [ ] Login with `ADMIN_PASSWORD` redirects to dashboard
- [ ] Dashboard shows stats (even if zeros initially)
- [ ] Plugins page shows 3 seed plugins
- [ ] "Run now" on a plugin executes and shows output
- [ ] Creating a schedule works and appears in the schedules table
- [ ] Calendar shows scheduled automations on correct days
- [ ] n8n workflows page shows setup message when key unset, or lists workflows when set
- [ ] `/n8n` loads the n8n UI
- [ ] Logout clears token and redirects to `/login`
- [ ] `docker compose down && docker compose up -d` restores all state
- [ ] No browser console errors on any page
- [ ] `npm run build` passes in both `backend/` and `frontend/`
- [ ] All backend unit tests pass
- [ ] All backend e2e tests pass
- [ ] All frontend component and hook tests pass
