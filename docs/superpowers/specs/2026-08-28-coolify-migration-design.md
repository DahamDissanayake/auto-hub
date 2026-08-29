# Coolify Migration Design

**Date:** 2026-08-28
**Status:** Approved (brainstorming) — pending implementation plan
**Host:** Raspberry Pi 5, 16 GB RAM, 4 cores, aarch64, Docker 29.5.3 / Compose v5.1.4

---

## 1. Goal

Move this Pi from a hand-rolled `docker-compose` AutoHub stack (systemd-supervised) to a
Coolify-managed deployment, without losing data and without changing the Cloudflare Tunnel.
End state:

- Coolify runs on this Pi as a self-hosted PaaS ("private server"), dashboard at
  `https://coolify.serenedge.com`.
- AutoHub is a Coolify **Docker Compose resource deployed from the GitHub repo**, still
  reachable at `https://autohub.serenedge.com` exactly as before (single origin, path routing).
- The existing Cloudflare Tunnel (ID `0c35e8a8-faa9-4dfd-a40a-6945eb79b153`, same token) is
  reused; `cloudflared` runs as its own Coolify resource.
- Postgres / n8n / mails data is preserved via full backups **and** external-volume reuse.
- Leftovers from previous deployments are cleaned off the SSD.

---

## 2. Current state (discovered)

| Fact | Value |
|---|---|
| Stack supervision | `auto-hub.service` (systemd oneshot, `docker compose up -d`), `auto-hub-watchdog.timer` (every 5 min) |
| Edge | AutoHub `nginx` publishes host `:80`; `cloudflared` (in-compose, `network_mode: host`) → `localhost:80` |
| Tunnel | Remotely-managed / token-based. Tunnel ID `0c35e8a8-faa9-4dfd-a40a-6945eb79b153`. Ingress: `autohub.serenedge.com → http://localhost:80`, else 404. Routing lives in the Cloudflare Zero Trust dashboard, not on disk. |
| Domain | `serenedge.com` (Cloudflare), current public hostname `autohub.serenedge.com` |
| Data volumes | `auto-hub_postgres_data` (holds **both** the AutoHub DB and n8n's `n8n` DB), `auto-hub_n8n_data`, `auto-hub_mails_data`. Also a stale `auto-hub_plugins_data` (current compose uses a bind mount, not this volume). |
| Git remote | `https://github.com/DahamDissanayake/auto-hub.git` (visibility to be confirmed) |
| Docker storage | **Already on the SSD** — `/etc/docker/daemon.json` = `{"data-root":"/mnt/data/docker"}`, `docker info` confirms `Docker Root Dir: /mnt/data/docker`. No migration needed. |
| Disk | `/` (SD card) 28 GB, ~12 GB free. `/mnt/data` (SSD) 220 GB, ~194 GB free. |
| Ports in use | `:80` (AutoHub nginx). `:443` and `:8000` free. |
| AutoHub nginx routing | One hostname, path-routed: `/` → frontend, `/api/` → backend:4000, `/n8n/` → n8n:5678 (basic-auth), `/terminal-ws/` → terminal:7681, `/files-api/` → files:5050, `/mails-api/` → mails:3001 |

---

## 3. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | How AutoHub runs under Coolify | **Coolify-managed, deployed from the GitHub repo** as a Docker Compose resource. `.env` values become Coolify environment variables. |
| D2 | Edge routing | **Cloudflare Tunnel → Coolify Traefik (`localhost:80`) → host-routed apps.** `cloudflared` becomes its own Coolify resource. |
| D3 | Data preservation | **Backup first** (`pg_dumpall` + tar of n8n/mails volumes + copy of `.env`), **then declare the 3 volumes `external: true`** pointing at the existing `auto-hub_*` volumes. No restore needed on the happy path; backups are the safety net. |
| D4 | Docker storage location | Already on SSD — no action beyond pointing Coolify's `/data/coolify` at the SSD via symlink. |
| D5 | Cloudflare changes | **Done by hand** by the operator, following the step-by-step in §7. No API token shared. |
| D6 | SSD leftover cleanup | Archive-then-delete stale dotfiles at `/mnt/data/` root; archive-only (no delete) for `/mnt/data/.claude*`; **delete** `/mnt/data/FILE-SEVER/` (archived to backups first as a 7-day safety net); keep `github/`, `docker/`, `containerd/`, `lost+found/`. |

---

## 4. Target architecture

```
Internet  ── HTTPS ──►  Cloudflare edge
                              │
                              ▼
             Cloudflare Tunnel  0c35e8a8-…  (same token, unchanged)
               ingress rules (Zero Trust dashboard):
                 autohub.serenedge.com  → http://localhost:80
                 coolify.serenedge.com  → http://localhost:80   (HTTP Host Header: coolify.serenedge.com)
                              │
                              ▼
             cloudflared  ── standalone Coolify resource, network_mode: host
                              │
                              ▼
             Coolify Traefik (coolify-proxy)  ── owns host :80 / :443
               host-based routing:
                 coolify.serenedge.com  → Coolify dashboard (:8000 internal)
                 autohub.serenedge.com  → autohub-nginx:80
                              │
                              ▼
             AutoHub stack (Coolify "Docker Compose" resource, from git)
               nginx ─► frontend / backend / n8n / terminal / files / mails
               postgres, redis
               data: auto-hub_{postgres,n8n,mails}_data  (external volumes)
```

### Changes vs. today

- `cloudflared` leaves `docker-compose.yml`, becomes its own Coolify resource (token only).
- AutoHub `nginx` stops publishing host `:80` (`ports` → `expose`). Traefik reaches it via a
  Coolify-assigned domain label on the `nginx` service. Its internal path routing is untouched.
- `auto-hub.service` and `auto-hub-watchdog.*` systemd units are **disabled and removed** —
  Coolify owns lifecycle.
- Everything else (bind mounts, `docker.sock`, `SYS_BOOT`, `group_add`, `user`, `hostname`)
  carries over unchanged.
- SSL/Let's Encrypt in Coolify is **off** for these hostnames — Cloudflare terminates TLS at
  the edge; tunnel → Traefik is plain HTTP. Cloudflare SSL/TLS mode stays **Full**.

---

## 5. Teardown & leftover cleanup

### 5.1 Stop the current stack (data-safe)

```bash
B=/mnt/data/backups/pre-coolify-2026-08-28 && mkdir -p "$B"
sudo cp /etc/systemd/system/auto-hub*.service /etc/systemd/system/auto-hub*.timer "$B/"  # for rollback
sudo systemctl disable --now auto-hub.service auto-hub-watchdog.timer auto-hub-watchdog.service
cd /home/dama/repo/auto-hub && docker compose down          # NO -v
sudo rm /etc/systemd/system/auto-hub*.service /etc/systemd/system/auto-hub*.timer
sudo systemctl daemon-reload
```

The unit files are copied to the backup folder above **before** removal, for rollback (§12).

### 5.2 Backups (to the SSD, before anything else)

```bash
B=/mnt/data/backups/pre-coolify-2026-08-28   # already created in §5.1

# Postgres — all databases (autohub + n8n)
docker compose up -d postgres
docker compose exec -T postgres pg_dumpall -U autohub > "$B/pgdumpall.sql"
docker compose down

# n8n + mails volumes
docker run --rm -v auto-hub_n8n_data:/v  -v "$B":/b alpine tar czf /b/n8n_data.tgz  -C /v .
docker run --rm -v auto-hub_mails_data:/v -v "$B":/b alpine tar czf /b/mails_data.tgz -C /v .

# secrets for rollback + Coolify env-var entry (systemd units already copied in §5.1)
cp /home/dama/repo/auto-hub/.env "$B/autohub.env"
```

### 5.3 Remove build leftovers (keeps the 3 data volumes + base images)

```bash
docker compose down --remove-orphans
docker image rm auto-hub-backend auto-hub-frontend auto-hub-terminal auto-hub-files auto-hub-mails 2>/dev/null || true
docker volume rm auto-hub_plugins_data          # stale — not used by current compose
docker builder prune -af
docker image prune -af
docker network prune -f
```

### 5.4 SSD leftovers from previous deployments

Inventory of `/mnt/data/` today:

| Item | Size | Assessment | Action |
|---|---|---|---|
| `.bash_history` `.cache/` `.config/` `.local/` `.npm/` `.profile` `.zshrc` `.tmux.conf` `.terminal-sessions.json` | small | Stale shell dotfiles from an earlier terminal-container `$HOME` layout (now uses `/home/dama`) | `tar czf $B/ssd-dotfiles.tgz` then delete from `/mnt/data/` root |
| `.claude/` `.claude.json` | ~80 KB | May be a terminal "Claude Code profile" store (`.credentials.json` present) | **Archive only**, do NOT delete until confirmed unused by the terminal service |
| `FILE-SEVER/` | 208 MB | root-owned test uploads: `IMG_5243.mp4`, `IMG_5862.mov`, `test2.mp4`, `Instructions for External Applicants.pdf` | `tar czf $B/FILE-SEVER.tgz` then **delete** (operator-approved) |
| `github/` | 715 MB | Active repo clones (`/workspace/github`) | Keep |
| `docker/` `containerd/` | live | Actual Docker/containerd data-root | **Do not touch** |
| `lost+found/` | — | ext4 | Keep |

```bash
tar czf "$B/ssd-dotfiles.tgz" -C /mnt/data .bash_history .cache .config .local .npm .profile .zshrc .tmux.conf .terminal-sessions.json 2>/dev/null || true
tar czf "$B/dot-claude.tgz"   -C /mnt/data .claude .claude.json 2>/dev/null || true
sudo tar czf "$B/FILE-SEVER.tgz" -C /mnt/data FILE-SEVER

rm -f  /mnt/data/.bash_history /mnt/data/.profile /mnt/data/.zshrc /mnt/data/.tmux.conf /mnt/data/.terminal-sessions.json
rm -rf /mnt/data/.cache /mnt/data/.config /mnt/data/.local /mnt/data/.npm
sudo rm -rf /mnt/data/FILE-SEVER
# /mnt/data/.claude and /mnt/data/.claude.json: archived, left in place for now
```

---

## 6. Install Coolify

```bash
sudo mkdir -p /mnt/data/coolify
sudo ln -s /mnt/data/coolify /data/coolify        # installer writes to /data/coolify → SSD
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

Installer detects existing Docker + aarch64, brings up `coolify`, `coolify-db`,
`coolify-redis`, `coolify-proxy` (Traefik) on `:80`, `:443`, `:8000`. Port 80 is free after §5.

Browser → `http://<pi-lan-ip>:8000`:

1. Create the admin account (first user = owner).
2. **Settings → Configuration:**
   - Instance domain: `coolify.serenedge.com`
   - "Generate SSL / Let's Encrypt": **off**
3. **Servers → localhost** is auto-registered as the deploy target.

---

## 7. Cloudflare changes (by hand)

The tunnel and its token are unchanged. Only a public hostname is added; Cloudflare
auto-creates its DNS record.

### 7.1 Open the tunnel
1. **one.dash.cloudflare.com** (Zero Trust) → **Networks → Tunnels**.
2. Open the tunnel whose ID starts `0c35e8a8` (status HEALTHY).
3. **Public Hostname** tab. Existing row `autohub.serenedge.com → HTTP localhost:80` — **leave it**.

### 7.2 Add the Coolify hostname
4. **+ Add a public hostname**:
   - Subdomain: `coolify`
   - Domain: `serenedge.com`
   - Path: *(empty)*
   - Type: `HTTP`
   - URL: `localhost:80`
5. **Additional application settings → HTTP Settings → HTTP Host Header:** `coolify.serenedge.com`
6. **Save hostname**.

### 7.3 Confirm DNS
7. **dash.cloudflare.com → serenedge.com → DNS → Records.** Expect:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `autohub` | `0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com` | Proxied |
| CNAME | `coolify` | `0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com` | Proxied |

If `coolify` is missing, add it manually: CNAME, name `coolify`, target
`0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com`, Proxied, TTL Auto.

### 7.4 TLS mode
8. **SSL/TLS → Overview → mode = Full** (not "Full (strict)", not "Flexible"). Already correct
   for `autohub` today — just confirm.

---

## 8. Repo changes (branch `coolify-migration`)

Three edits to `docker-compose.yml`.

### 8.1 Volumes → external

```yaml
volumes:
  postgres_data:
    external: true
    name: auto-hub_postgres_data
  n8n_data:
    external: true
    name: auto-hub_n8n_data
  mails_data:
    external: true
    name: auto-hub_mails_data
```

### 8.2 Remove the `cloudflared:` service

Delete the whole `cloudflared:` block and remove `cloudflared` from `nginx.depends_on`.

### 8.3 `nginx` service — stop binding host :80

```yaml
  nginx:
    image: nginx:alpine
    expose:
      - "80"            # was: ports: ["80:80"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/htpasswd:/etc/nginx/htpasswd:ro
    depends_on: [frontend, backend, n8n, terminal, files, mails]
    restart: unless-stopped
```

Everything else unchanged. `${...}` interpolation keeps working — Coolify substitutes from the
resource's env vars.

### 8.4 Pre-flight before committing

- `ls backend/plugins/` — every registered plugin's folder must be committed to git (Coolify
  builds from a fresh clone). Plugin **DB registration** survives in Postgres regardless; only
  uncommitted plugin **files** would be lost.
- Confirm repo visibility. **Private** → add a GitHub App in Coolify (Settings → Sources) or a
  deploy key before §9.2. **Public** → nothing to do.

---

## 9. Coolify resources

**Project `autohub` → environment `production`**, two resources.

### 9.1 Resource `cloudflared` — Docker Compose (raw)

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    network_mode: host
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
      TUNNEL_TRANSPORT_PROTOCOL: http2
    restart: always
```

- Env var `CLOUDFLARE_TUNNEL_TOKEN` = value from `$B/autohub.env`.
- Deploy **first**; confirm the tunnel shows HEALTHY in Cloudflare before deploying AutoHub.

### 9.2 Resource `auto-hub` — Docker Compose from Git

- Source: `github.com/DahamDissanayake/auto-hub`, branch `coolify-migration`
  (switch to `main` after merge).
- Build pack: **Docker Compose**, file `docker-compose.yml`.
- **Environment variables** — every key from `$B/autohub.env` **except** `CLOUDFLARE_TUNNEL_TOKEN`:
  `DOMAIN, FRONTEND_URL, ADMIN_PASSWORD, JWT_SECRET, POSTGRES_PASSWORD, TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID, N8N_API_KEY, TIMEZONE, PLUGIN_DIR, GH_TOKEN`.
- **Service domains:**
  - `nginx` → `http://autohub.serenedge.com`, port `80`
  - no domain on any other service
- SSL / Let's Encrypt for the nginx domain → **off**.
- Deploy. First ARM build (NestJS + 2× Next.js) ≈ 10–20 min.

---

## 10. Bring-up order

1. §5 teardown + backups + cleanup
2. §6 install Coolify
3. §7 Cloudflare hostname + DNS
4. §8 commit `coolify-migration` branch, push
5. §9.1 deploy `cloudflared` → confirm tunnel HEALTHY
6. §9.2 deploy `auto-hub` → watch build logs

---

## 11. Verification checklist

- `docker volume ls` — deploy uses `auto-hub_postgres_data` / `_n8n_data` / `_mails_data`;
  **no new empty copies** under a Coolify project prefix.
- `docker logs <postgres>` — *"database system is ready"* against the existing cluster, **not**
  `initdb` / "creating initial database". initdb ⇒ external-volume wiring failed — **stop**.
- `docker exec <postgres> psql -U autohub -d autohub -c '\dt'` — AutoHub tables present.
- `docker exec <postgres> psql -U autohub -d n8n -c '\dt'` — n8n tables present.
- `https://autohub.serenedge.com/` loads the frontend.
- `/api/` health responds; `/n8n/` prompts basic-auth; terminal WebSocket connects;
  `/files-api/` and `/mails-api/` respond.
- `https://coolify.serenedge.com` loads the dashboard over HTTPS.
- Reboot the Pi once → both resources auto-start.

---

## 12. Rollback

Nothing destructive touches the data volumes or the tunnel, so rollback is quick:

1. Coolify → `auto-hub` resource → **Stop**.
2. `cd /home/dama/repo/auto-hub && git checkout main`
3. `sudo cp $B/auto-hub*.service $B/auto-hub*.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now auto-hub.service`
4. If Coolify's Traefik still holds `:80`: `docker stop coolify-proxy` (or repoint the Cloudflare
   `autohub` hostname), then the AutoHub nginx can bind `:80` again — this requires reverting
   §8.3 locally (`git checkout main` already does).
5. Only if a data volume was clobbered: `docker compose down`, restore from `$B/`
   (`psql -U autohub -f pgdumpall.sql`, `tar -xzf *_data.tgz` into fresh volumes), then `up -d`.

`cloudflared` can stay on Coolify regardless of which proxy answers on `:80`.

---

## 13. Known one-way effects

- The web terminal's "edit repo + run `scripts/deploy.sh`" workflow ends. Coolify deploys from
  its own clone on `git push` or a manual "Redeploy". `/home/dama/repo/auto-hub` stays as a
  working checkout but is no longer the deploy source. `deploy.sh` / `install.sh` / `watchdog.sh`
  and the systemd units are retired.
- `FILE-SEVER/` is deleted (archived to `$B/FILE-SEVER.tgz` first, 7-day safety net).
- Coolify's Traefik becomes the host's `:80`/`:443` owner. Any future service on this Pi that
  wants those ports must go through Coolify.

---

## 14. Out of scope

- Migrating AutoHub's internal `nginx` path routing into Traefik (kept as-is inside the stack).
- Moving n8n's database out of the shared Postgres.
- Multi-server / remote deploy targets in Coolify.
- CI beyond Coolify's built-in git-push deploy.

---

## 15. As-built notes (2026-08-29)

The migration ran but several design assumptions did not survive contact with Coolify 4.3.14.
What actually shipped:

- **Coolify's Docker Compose build pack rewrites the compose.** It ignores `external: true` and
  namespaces every named volume as `<resource-uuid>_<name>` (`_`→`-`), and it rewrites
  repo-relative bind mounts to empty dirs on disk. So the D3 "external volumes" plan did not
  work.
  - Fix: `nginx` now `build: ./nginx` — `nginx/Dockerfile` bakes in `nginx.conf` and generates
    `/etc/nginx/htpasswd` from the `ADMIN_PASSWORD` build arg (`nginx/htpasswd` is gitignored).
    The `/n8n/` basic-auth user is `admin`, password = `ADMIN_PASSWORD`.
  - Fix: dropped the `./backend/plugins` bind mount — `backend/Dockerfile` already `COPY`s
    `plugins/` and nothing writes them at runtime.
  - Data: the real `auto-hub_*` volume contents were copied into Coolify's
    `nk2lie8pkqrahkdxutemmhlw_{postgres-data,n8n-data,mails-data}` volumes. **Recreating the
    Coolify `auto-hub` resource changes the UUID and needs the copy redone.**
- **The Coolify installer overwrote `/etc/docker/daemon.json`** and dropped `data-root`, so
  Docker reverted to `/var/lib/docker` (SD card). Restored: `data-root` back to
  `/mnt/data/docker`, `/var/lib/docker` contents rsynced onto it, plus a drop-in
  `/etc/systemd/system/docker.service.d/10-wait-for-ssd.conf` (`RequiresMountsFor=/mnt/data`)
  so a slow boot can't start Docker before the SSD mounts.
- **`/data/coolify`** is a symlink to `/mnt/data/coolify`.
- **Instance/app domains use the `http://` scheme in Coolify** (not `https://`). With
  `https://`, Coolify makes Traefik force http→https and the tunnel (plain-HTTP origin) loops
  forever. Cloudflare SSL/TLS mode stays **Full**; the edge does TLS.
- **Coolify's DNS validation** flags `autohub.<domain>` (resolves to Cloudflare IPs, not the
  Pi) and `www.` (no record) — both expected with a tunnel; bypass the warning, set redirect
  to non-www.
- **`frontend/package-lock.json`** was out of sync with `package.json` (`sharp` missing) — a
  latent bug that only surfaced on Coolify's clean `npm ci`. Regenerated.
- Retired: `scripts/{install,deploy,watchdog}.sh` and the `auto-hub*.service` /
  `auto-hub-watchdog.*` systemd units. Coolify owns deploy + lifecycle now.
- Pre-migration backups kept at `/mnt/data/backups/pre-coolify-2026-08-28/` and
  `/mnt/data/_preserve_volumes/`.
