# AutoHub

A self-hosted personal automation OS for Raspberry Pi 5.

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/auto-hub/main/scripts/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/yourusername/auto-hub.git
cd auto-hub
cp .env.example .env
# Edit .env with your settings
docker compose up -d --build
```

Visit http://localhost and log in with your `ADMIN_PASSWORD`.

## Stack

- **Frontend:** Next.js 14 (App Router)
- **Backend:** NestJS 10
- **Database:** PostgreSQL 16
- **Queue:** Redis 7 + BullMQ
- **Automation:** n8n (self-hosted)
- **Proxy:** Nginx + Cloudflare Zero Trust

## Plugins

Drop a plugin folder into the Docker volume at `PLUGIN_DIR=/app/plugins` and restart the backend. Each plugin needs a `manifest.json` and `index.js`.
