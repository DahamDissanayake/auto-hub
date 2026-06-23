# AutoHub

A self-hosted personal automation OS built for Raspberry Pi 5. AutoHub bundles a web terminal, plugin runner, Docker manager, n8n workflow integration, file browser, and Telegram notifications into a single Docker Compose stack — accessible from anywhere via a Cloudflare Tunnel.

---

## Features

- **Dashboard** — system health at a glance: container status, active plugins, scheduled jobs, n8n workflow states
- **Web Terminal** — full xterm.js terminal over WebSocket with named sessions, multi-tab support, workspace and repo pickers, and Claude Code profile switching
- **Plugin System** — drop in Node.js plugin folders; run them manually or on a cron schedule with BullMQ; results pushed via Telegram
- **Docker Manager** — list all containers, start / stop / restart individual services or the whole stack, run a network speed test
- **n8n Workflows** — browse, activate, and deactivate n8n automation workflows from the AutoHub UI
- **File Manager** — browse and manage files across home, workspace, and data volumes
- **Calendar** — view scheduled jobs in a calendar layout
- **Settings** — timezone configuration, session & device management, full login history
- **Authentication** — two-step login (password + OTP via Telegram), device trust (permanent devices skip OTP), rolling JWT sessions, Redis-backed refresh tokens

---

## Architecture

```
Browser
  └─► Nginx (port 80)
        ├─► /api/         → Backend  (NestJS)
        ├─► /n8n/         → n8n
        ├─► /terminal-ws/ → Terminal (node-pty WS)
        ├─► /files-api/   → Files service
        └─► /             → Frontend (Next.js)

Cloudflare Tunnel → Nginx   (public HTTPS, no port-forwarding)
```

### Services

| Service | Image / Build | Purpose |
|---|---|---|
| `postgres` | postgres:16-alpine | Primary database |
| `redis` | redis:7-alpine | Session store + BullMQ queue |
| `n8n` | n8nio/n8n | Workflow automation |
| `backend` | `./backend` | NestJS REST API |
| `frontend` | `./frontend` | Next.js 14 app |
| `terminal` | `./terminal` | WebSocket PTY server |
| `files` | `./files` | File browser API |
| `nginx` | nginx:alpine | Reverse proxy |
| `cloudflared` | cloudflare/cloudflared | Cloudflare Tunnel connector |

### Technology Stack

**Frontend**
- Next.js 14 (App Router), React 18, Tailwind CSS
- TanStack Query for data fetching, Zustand for local state
- xterm.js for the in-browser terminal
- lucide-react icons, date-fns, react-markdown

**Backend**
- NestJS 10, TypeORM, PostgreSQL 16
- BullMQ + Redis for scheduled plugin jobs
- Passport + JWT for authentication
- node-telegram-bot-api for Telegram notifications
- ua-parser-js for device fingerprinting

**Terminal service**
- Express + ws + node-pty
- Multi-session management with named sessions
- Claude Code profile switching (saves / restores `~/.claude` credentials per account)

---

## Quick Start

### Prerequisites

- Raspberry Pi 5 (4 GB+ RAM) running Raspberry Pi OS 64-bit (Bookworm)
- Docker and Docker Compose v2 installed
- A Cloudflare account with a domain managed by Cloudflare DNS (free tier works)

### 1. Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker compose version
```

### 2. Clone and configure

```bash
git clone https://github.com/DahamDissanayake/auto-hub.git
cd auto-hub
cp .env.example .env
nano .env
```

Fill in every variable (see [Environment Variables](#environment-variables) below).

### 3. Build and start

```bash
docker compose up -d --build
```

The first build takes 5–10 minutes on a Pi 5. Once complete:

```bash
docker compose ps          # all services should show "running"
curl http://localhost/api/health   # should return {"status":"ok"}
```

### 4. Set up Cloudflare Tunnel

1. Go to **Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel**
2. Name it `autohub`, save, and copy the tunnel token (the long `eyJ...` string)
3. Add the token to `.env` as `CLOUDFLARE_TUNNEL_TOKEN=`
4. In the tunnel's **Public Hostname** settings, add:
   - **Subdomain:** `autohub` (or any prefix you like)
   - **Domain:** `yourdomain.com`
   - **Type:** HTTP, **URL:** `localhost:80`
5. Restart cloudflared: `docker compose up -d cloudflared`

Visit `https://autohub.yourdomain.com` — you should reach the login screen.

### 5. Log in

Use the `ADMIN_PASSWORD` from your `.env` file. On first login from a new device, AutoHub sends a one-time code via Telegram (if configured). You can mark a device as **permanent** in Settings to skip OTP on future logins.

---

## Environment Variables

Copy `.env.example` to `.env` and set each value before starting the stack.

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `ADMIN_PASSWORD` | Yes | AutoHub login password |
| `JWT_SECRET` | Yes | Secret for signing JWTs — generate with `openssl rand -hex 64` |
| `DOMAIN` | Yes | Public domain, e.g. `autohub.yourdomain.com` (no `https://`) |
| `TIMEZONE` | Yes | IANA timezone string, e.g. `Asia/Colombo` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Yes | Token from the Cloudflare Tunnel dashboard |
| `FRONTEND_URL` | Yes | Full HTTPS URL for CORS, e.g. `https://autohub.yourdomain.com` |
| `TELEGRAM_BOT_TOKEN` | Optional | Bot token from @BotFather — enables OTP and plugin notifications |
| `TELEGRAM_CHAT_ID` | Optional | Your Telegram chat ID — required when bot token is set |
| `N8N_API_KEY` | Optional | n8n API key — enables workflow management from AutoHub |
| `GH_TOKEN` | Optional | GitHub PAT — used by the terminal for authenticated git operations |

---

## Authentication

AutoHub uses a two-step login flow:

1. **Password** — the `ADMIN_PASSWORD` from `.env`
2. **OTP** — a six-digit code sent to Telegram (skipped if the device is marked permanent)

Sessions are stored in Redis with a rolling 7-day TTL on permanent devices. Access tokens are short-lived JWTs; refresh tokens rotate on each use. You can review all active sessions, revoke individual ones, or sign out of all devices from the **Settings → Sessions & Devices** page.

---

## Plugins

Plugins are Node.js scripts that AutoHub can run on demand or on a cron schedule.

### Structure

```
plugins/
└── my-plugin/
    ├── manifest.json
    └── index.js
```

**`manifest.json`**
```json
{
  "slug": "my-plugin",
  "name": "My Plugin",
  "description": "Does something useful",
  "entryFile": "index.js",
  "configSchema": []
}
```

**`index.js`**
```js
exports.run = async function(config) {
  return { result: 'hello from my-plugin' };
};
```

### Deploying a plugin

Drop the plugin folder into `./backend/plugins/` (mapped to `/app/plugins` in the container), then register it from the AutoHub Plugins page or via the API:

```bash
curl -X POST http://localhost/api/plugins/register \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"my-plugin"}'
```

### Scheduling

Plugins can be scheduled with a cron expression from the AutoHub UI or API. Jobs are queued via BullMQ and run in the backend container. On completion, a Telegram notification is sent with the result.

---

## Terminal

The web terminal connects over WebSocket to a `node-pty` process running inside the `terminal` container. Features:

- **Named sessions** — create, resume, and switch between persistent terminal sessions
- **Workspace picker** — switch between configured workspace directories (`home`, `github`, `auto-hub`)
- **Repo picker** — browse git repositories in the workspace and open them directly
- **Clone dialog** — clone a GitHub repo from the UI
- **Grid view** — view multiple terminal panes side by side
- **Markdown browser** — read `.md` files from the current directory in a side drawer
- **Claude Code profiles** — the terminal service manages multiple Claude Code accounts, saving and restoring credentials per profile

---

## Scripts

| Script | Usage |
|---|---|
| `scripts/install.sh` | One-shot installer: installs Docker if missing, clones repo, prompts for `.env`, builds stack |
| `scripts/deploy.sh [service...]` | Rebuild and redeploy all services or specific ones without downtime |
| `scripts/watchdog.sh` | Checks all containers; runs `docker compose up -d` if any are not running — set as a cron job |

### Watchdog cron (recommended)

```bash
crontab -e
# Add:
*/5 * * * * /home/dama/repo/auto-hub/scripts/watchdog.sh >> /var/log/autohub-watchdog.log 2>&1
```

---

## Updating

```bash
cd ~/auto-hub
git pull
docker compose up -d --build
```

Only changed images are rebuilt. Database and plugin volumes are preserved.

---

## Day-to-day commands

```bash
# Check container status
docker compose ps

# Tail all logs
docker compose logs -f

# Tail a single service
docker compose logs -f backend

# Rebuild and redeploy specific services
./scripts/deploy.sh backend frontend

# Restart a single service
docker compose restart backend

# Open a shell in the backend container
docker compose exec backend sh

# Check the database
docker compose exec postgres psql -U autohub -d autohub
```

---

## Troubleshooting

**502 Bad Gateway / blank frontend**
```bash
docker compose logs nginx
docker compose logs frontend
# Frontend build may still be compiling — wait ~30 s and reload
```

**Backend health check fails**
```bash
docker compose logs backend
# Check DATABASE_URL and REDIS_URL are reachable
docker compose exec backend sh -c 'echo $DATABASE_URL'
```

**`cloudflared` keeps restarting**
```bash
docker compose logs cloudflared
# CLOUDFLARE_TUNNEL_TOKEN is likely missing or malformed in .env
```

**OTP never arrives on Telegram**
```bash
# Test the bot directly:
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" -d text="test"
# Response should contain "ok":true
```

**Wipe everything and start fresh (destructive — deletes DB)**
```bash
docker compose down -v
docker compose up -d --build
```

---

## Project layout

```
auto-hub/
├── backend/          # NestJS API (auth, plugins, docker, n8n, scheduler, …)
├── frontend/         # Next.js 14 app
├── terminal/         # WebSocket PTY server + Claude Code profile manager
├── files/            # File browser API
├── nginx/            # nginx.conf and htpasswd
├── scripts/          # install.sh, deploy.sh, watchdog.sh
├── dev-logs/         # Setup guides and test notes
└── docker-compose.yml
```
