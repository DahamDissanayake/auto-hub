# AutoHub — Raspberry Pi Setup Guide

Complete walkthrough: fresh Pi → AutoHub running with a public domain via Cloudflare Tunnel.

---

## Prerequisites

**Hardware / accounts you need before starting:**
- Raspberry Pi 5 (4 GB+ recommended) running Raspberry Pi OS 64-bit (Bookworm)
- SD card ≥ 32 GB (class 10 / A2 rated)
- The Pi connected to your network with a static IP or DHCP reservation
- A GitHub account with access to this repo
- A Cloudflare account (free tier works)
- A domain managed by Cloudflare DNS

---

## Step 1 — First-time Pi setup (skip if already done)

SSH into your Pi from your dev machine:

```bash
ssh pi@<your-pi-ip>
```

Update the system fully before touching anything else:

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

After reboot, SSH back in. Set your timezone (replace with yours):

```bash
sudo timedatectl set-timezone Asia/Colombo
timedatectl   # confirm it applied
```

---

## Step 2 — Install Docker

The official one-liner works on Pi OS 64-bit:

```bash
curl -fsSL https://get.docker.com | sh
```

Add your user to the docker group so you don't need sudo every time:

```bash
sudo usermod -aG docker $USER
```

**Log out and SSH back in** — the group change only applies to new sessions:

```bash
exit
# then SSH back in
ssh pi@<your-pi-ip>
```

Verify Docker is working:

```bash
docker run --rm hello-world
docker compose version
```

Both commands should succeed. The compose version should be 2.x+.

---

## Step 3 — Clone the repo

```bash
cd ~
git clone https://github.com/DahamDissanayake/auto-hub.git
cd auto-hub
```

---

## Step 4 — Create the `.env` file

Copy the example and fill in every value:

```bash
cp .env.example .env
nano .env
```

Here is what each variable means:

```
# Database password — pick anything strong
POSTGRES_PASSWORD=change_this_to_something_strong

# The password you will use to log in to AutoHub
ADMIN_PASSWORD=your_autohub_login_password

# Random secret used to sign JWTs — generate one:
#   openssl rand -hex 64
JWT_SECRET=paste_64_byte_hex_here

# Your public domain (no https://, no trailing slash)
DOMAIN=autohub.yourdomain.com

# Your Pi's timezone string (same as timedatectl above)
TIMEZONE=Asia/Colombo

# Telegram bot notifications (optional — fill in after Step 7, leave blank to disable)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# n8n API key (fill in after n8n first-run — see Step 7)
N8N_API_KEY=

# Cloudflare Tunnel token (fill in after creating the tunnel — see Step 6)
CLOUDFLARE_TUNNEL_TOKEN=

# Frontend URL for CORS (set to your public domain once Cloudflare is up)
FRONTEND_URL=https://autohub.yourdomain.com
```

To generate a secure `JWT_SECRET`:

```bash
openssl rand -hex 64
```

Paste the output directly into `.env`.

Save and exit nano: `Ctrl+X` → `Y` → `Enter`.

---

## Step 5 — Build and start the stack

This will build the backend and frontend Docker images from source and start all 7 services. The first build takes 5–10 minutes on a Pi 5.

```bash
docker compose up -d --build
```

Watch the logs to confirm all services come up:

```bash
docker compose logs -f
```

Press `Ctrl+C` to stop tailing. Check all containers are running:

```bash
docker compose ps
```

You should see all 7 services with status `Up` or `running`:
- `postgres`, `redis`, `n8n`, `backend`, `frontend`, `nginx`, `cloudflared`

**`cloudflared` will show as restarting until you fill in `CLOUDFLARE_TUNNEL_TOKEN` in Step 6.** That is expected — everything else should be up.

Test locally on the Pi:

```bash
curl -s http://localhost/api/health | python3 -m json.tool
```

You should get a JSON response with `status: "ok"`.

---

## Step 6 — Set up Cloudflare Tunnel

This gives AutoHub a public HTTPS URL without port-forwarding on your router.

### 6a — Create the tunnel

1. Go to [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create a tunnel**
2. Select **Cloudflared** as the connector type
3. Name it `autohub` → **Save tunnel**
4. Cloudflare will show you an **Install and run a connector** page with a command like:
   ```
   cloudflared service install eyJhIjoiMTIz...
   ```
   **Do NOT run this command on the Pi.** The connector already runs inside Docker via the `cloudflared` service in `docker-compose.yml`. You only need the token.
5. Copy just the token — the long `eyJ...` string at the end of that command. That is the only thing you need from this page.

### 6b — Add the token to `.env`

```bash
nano .env
```

Paste the token as the value of `CLOUDFLARE_TUNNEL_TOKEN`. Save and exit.

### 6c — Configure the tunnel's public hostname

Still in the Cloudflare dashboard, under your new tunnel → **Public Hostname** → **Add a public hostname**:

| Field | Value |
|---|---|
| Subdomain | `autohub` (or whatever prefix you want) |
| Domain | `yourdomain.com` |
| Type | `HTTP` |
| URL | `localhost:80` |

Save. Cloudflare will automatically create the DNS record.

### 6d — Restart cloudflared with the new token

```bash
docker compose up -d cloudflared
```

Check it connected:

```bash
docker compose logs cloudflared
```

You should see `Connection registered` or `Registered tunnel connection`. Visit `https://autohub.yourdomain.com` in a browser — you should reach the AutoHub login screen.

---

## Step 7 — Set up Telegram notifications (optional)

AutoHub sends you a Telegram message every time a plugin succeeds or fails. You need two things: a **bot token** and your **personal chat ID**.

### 7a — Create a Telegram bot via BotFather

1. Open Telegram and search for **@BotFather** (the official blue-tick bot)
2. Start a chat with it and send:
   ```
   /newbot
   ```
3. BotFather will ask for a **name** — this is the display name shown in chats. Type something like:
   ```
   AutoHub
   ```
4. BotFather will then ask for a **username** — must end in `bot`, must be unique globally. For example:
   ```
   MyAutoHubBot
   ```
5. BotFather replies with your **bot token** — a string that looks like:
   ```
   7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxx
   ```
   Copy this — it is your `TELEGRAM_BOT_TOKEN`.

> Keep the bot token secret. Anyone who has it can send messages as your bot.

### 7b — Start a chat with your new bot

Open Telegram, search for the username you just created (e.g. `@MyAutoHubBot`), and press **Start**. This is required — Telegram will not deliver messages to a chat that has never been initiated.

### 7c — Get your personal chat ID

Your chat ID tells the bot which conversation to send messages to. The easiest way is to use the Telegram API directly:

Open this URL in your browser (replace `YOUR_TOKEN` with your actual bot token):

```
https://api.telegram.org/botYOUR_TOKEN/getUpdates
```

Example with a real token:
```
https://api.telegram.org/bot7123456789:AAFxxxxxxxx/getUpdates
```

After pressing **Start** in Step 7b, you will see a JSON response like:

```json
{
  "ok": true,
  "result": [
    {
      "message": {
        "chat": {
          "id": 987654321,
          "first_name": "Daham",
          "type": "private"
        },
        "text": "/start"
      }
    }
  ]
}
```

The number under `"chat" → "id"` is your `TELEGRAM_CHAT_ID`. In this example it is `987654321`.

> If `result` is an empty array `[]`, go back to Telegram and send any message to your bot (e.g. `/start`), then refresh the URL.

### 7d — Add both values to `.env`

```bash
nano .env
```

Fill in the two Telegram lines:

```
TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxx
TELEGRAM_CHAT_ID=987654321
```

Save and exit.

### 7e — Restart the backend to pick up the new values

```bash
docker compose up -d backend
```

### 7f — Test that notifications work

Send a test message directly from the Pi to confirm the bot and chat ID are correct:

```bash
BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN ~/auto-hub/.env | cut -d= -f2)
CHAT_ID=$(grep TELEGRAM_CHAT_ID ~/auto-hub/.env | cut -d= -f2)

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  -d text="AutoHub is online 🟢"
```

You should receive the message in Telegram within a second or two. If the response JSON shows `"ok": true`, the bot is wired up correctly.

**Common errors:**

| Error | Cause | Fix |
|---|---|---|
| `{"ok":false,"error_code":401}` | Wrong bot token | Double-check `TELEGRAM_BOT_TOKEN` in `.env` |
| `{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}` | Wrong chat ID | Double-check `TELEGRAM_CHAT_ID` in `.env` |
| `result: []` in getUpdates | Bot never received a message | Open Telegram, send `/start` to your bot, then retry |

---

## Step 8 — Configure n8n (required for workflow features)

n8n needs a first-run setup before the backend can talk to it.

### 8a — Access the n8n UI

Open `https://autohub.yourdomain.com/n8n/` in your browser.

> n8n is restricted to local/private network access in `nginx.conf`. To access it from a remote browser, either:
> - Set up a Cloudflare Access policy for `/n8n/` path, or
> - SSH port-forward: `ssh -L 8080:localhost:80 pi@<your-pi-ip>` then open `http://localhost:8080/n8n/`

### 8b — Complete n8n setup wizard

Create your n8n owner account when prompted. Use a strong password — store it somewhere safe.

### 8c — Generate an n8n API key

1. In the n8n UI: click your user avatar (bottom-left) → **Settings** → **n8n API** → **Create an API key**
2. Copy the generated key

### 8d — Add the API key to `.env`

```bash
nano .env
```

Paste the key as `N8N_API_KEY=`. Save and exit.

Restart the backend to pick up the new variable:

```bash
docker compose up -d backend
```

---

## Step 9 — Log in to AutoHub

Open `https://autohub.yourdomain.com` in your browser.

Log in with the `ADMIN_PASSWORD` you set in `.env`.

You should land on the dashboard showing system health, plugin count, and n8n workflow status.

---

## Step 10 — Install plugins (optional)

Plugins are Node.js scripts dropped into the plugin volume. Each plugin is a folder containing:
- `manifest.json` — name, slug, description, entryFile, configSchema
- `index.js` — the script (receives `config` object, must export a `run` function)

### Find the plugin volume on disk

```bash
docker volume inspect auto-hub_plugins_data | grep Mountpoint
```

This prints the host path (usually `/var/lib/docker/volumes/auto-hub_plugins_data/_data`).

### Drop a plugin in

```bash
sudo mkdir -p /var/lib/docker/volumes/auto-hub_plugins_data/_data/my-plugin
sudo nano /var/lib/docker/volumes/auto-hub_plugins_data/_data/my-plugin/manifest.json
```

Minimal `manifest.json`:

```json
{
  "slug": "my-plugin",
  "name": "My Plugin",
  "description": "Does something useful",
  "entryFile": "index.js",
  "configSchema": []
}
```

Minimal `index.js`:

```js
exports.run = async function(config) {
  return { result: 'hello from my-plugin' };
};
```

Then register it from AutoHub's Plugins page → **Register** (enter slug `my-plugin`), or via API:

```bash
curl -s -X POST http://localhost/api/plugins/register \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"my-plugin"}'
```

---

## Useful day-to-day commands

```bash
# View all running containers
docker compose ps

# Tail all logs
docker compose logs -f

# Tail a single service
docker compose logs -f backend

# Restart a single service
docker compose restart backend

# Pull latest code and rebuild
git pull
docker compose up -d --build backend frontend

# Full restart of everything
docker compose down && docker compose up -d

# Open a shell in the backend container
docker compose exec backend sh

# Check PostgreSQL database
docker compose exec postgres psql -U autohub -d autohub
```

---

## Updating AutoHub

```bash
cd ~/auto-hub
git pull
docker compose up -d --build
```

Docker only rebuilds images that changed. The database and plugin volumes are preserved across updates.

---

## Troubleshooting

**Frontend shows blank / 502 Bad Gateway**
```bash
docker compose logs nginx
docker compose logs frontend
# Frontend build may still be starting — wait 30s and refresh
```

**Backend health check fails**
```bash
docker compose logs backend
# Usually a missing env var or DATABASE_URL connection issue
docker compose exec backend sh -c "echo \$DATABASE_URL"
```

**n8n page not loading**
```bash
docker compose logs n8n
# n8n takes ~30s to start on first boot
```

**`cloudflared` keeps restarting**
```bash
docker compose logs cloudflared
# Check CLOUDFLARE_TUNNEL_TOKEN is set correctly in .env
# Token must be the full base64 string from the Cloudflare dashboard
```

**Database connection refused**
```bash
docker compose logs postgres
# Postgres takes 10-15s on first boot to initialise the data directory
# Run: docker compose restart backend  after postgres is fully up
```

**Rebuild from scratch (keeps DB data)**
```bash
docker compose down
docker compose up -d --build
```

**Wipe everything including database (destructive)**
```bash
docker compose down -v
docker compose up -d --build
```
