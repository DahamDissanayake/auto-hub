# Coolify Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move this Raspberry Pi 5 from the systemd-supervised `docker-compose` AutoHub stack to a Coolify-managed deployment, reusing the existing Cloudflare Tunnel and preserving all Postgres / n8n / mails data.

**Architecture:** Cloudflare Tunnel (unchanged token/ID) → `cloudflared` (own Coolify resource, host network) → Coolify Traefik on host `:80/:443` → host-routes `coolify.serenedge.com` to the Coolify dashboard and `autohub.serenedge.com` to AutoHub's in-stack `nginx`, which keeps its existing path routing. AutoHub is a Coolify "Docker Compose" resource deployed from `github.com/DahamDissanayake/auto-hub` with the three data volumes declared `external`.

**Tech Stack:** Coolify v4 (self-hosted), Docker 29.5.3 / Compose v5.1.4, Traefik (bundled with Coolify), cloudflared, Cloudflare Zero Trust tunnel, Postgres 16, n8n, NestJS, Next.js 14.

## Global Constraints

- **Never** run `docker compose down -v`, `docker volume rm auto-hub_postgres_data|auto-hub_n8n_data|auto-hub_mails_data`, or `docker system prune --volumes` at any point. The three data volumes must survive.
- Cloudflare Tunnel token and tunnel ID are unchanged. Tunnel ID: `0c35e8a8-faa9-4dfd-a40a-6945eb79b153`. Its `cfargotunnel.com` CNAME target is `0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com`.
- Coolify SSL / Let's Encrypt is **OFF** for both `coolify.serenedge.com` and `autohub.serenedge.com`. TLS terminates at the Cloudflare edge; tunnel → Traefik is plain HTTP.
- Cloudflare **SSL/TLS mode = Full** for `serenedge.com` (confirm, do not change to Flexible or Full (strict)).
- Coolify data lives on the SSD: `/data/coolify` is a symlink to `/mnt/data/coolify`.
- Backup directory (referred to as `$B` throughout): `/mnt/data/backups/pre-coolify-2026-08-28`.
- `sudo` in this environment requires an interactive password. Steps tagged **[operator: sudo]** must be run by the human (in Claude Code, prefix with `!`). Steps tagged **[operator: browser]** are done in a web browser. Steps tagged **[agent]** need no elevation.
- Repo `github.com/DahamDissanayake/auto-hub` is **public** — no GitHub App or deploy key needed in Coolify.
- Work happens on branch `coolify-migration` until Task 13 promotes it to `main`.

---

### Task 1: Pre-flight checks & baseline snapshot

**Files:**
- Create: `/mnt/data/backups/pre-coolify-2026-08-28/baseline.txt` (snapshot, not in git)

**Interfaces:**
- Consumes: nothing.
- Produces: `$B/baseline.txt` — a human-readable record of the pre-migration state used to spot regressions in Task 12.

- [ ] **Step 1: [agent] Create the backup directory and capture the baseline**

```bash
B=/mnt/data/backups/pre-coolify-2026-08-28
mkdir -p "$B"
{
  echo "### date"; date -Is
  echo "### containers"; docker ps -a --filter name=auto-hub --format '{{.Names}}\t{{.State}}\t{{.Status}}'
  echo "### volumes"; docker volume ls --format '{{.Name}}' | grep auto-hub
  echo "### volume sizes"; for v in auto-hub_postgres_data auto-hub_n8n_data auto-hub_mails_data; do
    docker run --rm -v "$v":/v alpine du -sh /v | sed "s#/v#$v#"; done
  echo "### port 80"; ss -tlnp | grep ':80 ' || echo "nothing on :80"
  echo "### docker root"; docker info 2>/dev/null | grep 'Docker Root Dir'
  echo "### disk"; df -h / /mnt/data
  echo "### tracked plugin dirs"; git -C /home/dama/repo/auto-hub ls-files backend/plugins/ | cut -d/ -f3 | sort -u
  echo "### working plugin dirs"; ls /home/dama/repo/auto-hub/backend/plugins/
} | tee "$B/baseline.txt"
```

- [ ] **Step 2: [agent] Verify every runtime plugin folder is committed to git**

Run:
```bash
cd /home/dama/repo/auto-hub
comm -23 <(ls backend/plugins/ | sort) <(git ls-files backend/plugins/ | cut -d/ -f3 | sort -u)
```
Expected: **no output** (every plugin directory under `backend/plugins/` is tracked). If any name is printed, that plugin folder is untracked — `git add backend/plugins/<name>` and commit it on the `coolify-migration` branch in Task 3 before deploying, otherwise Coolify's fresh clone will not contain it.

- [ ] **Step 3: [agent] Verify the three data volumes exist and are non-empty**

Run:
```bash
for v in auto-hub_postgres_data auto-hub_n8n_data auto-hub_mails_data; do
  docker run --rm -v "$v":/v alpine sh -c 'echo -n "'"$v"': "; ls -A /v | wc -l'
done
```
Expected: each line prints a count **greater than 0** (e.g. `auto-hub_postgres_data: 25`).

- [ ] **Step 4: [agent] Confirm repo is reachable and public**

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://github.com/DahamDissanayake/auto-hub`
Expected: `200`

- [ ] **Step 5: Checkpoint**

No commit (snapshot only). Confirm `$B/baseline.txt` exists and contains the four sections. Do not proceed if Step 2 printed any plugin name that you have not resolved.

---

### Task 2: Full backups

**Files:**
- Create: `$B/pgdumpall.sql`, `$B/n8n_data.tgz`, `$B/mails_data.tgz`, `$B/autohub.env`, `$B/auto-hub.service`, `$B/auto-hub-watchdog.service`, `$B/auto-hub-watchdog.timer`

**Interfaces:**
- Consumes: `$B` from Task 1.
- Produces: a complete restore set. Task 12 rollback and any volume-clobber recovery read from here.

- [ ] **Step 1: [operator: sudo] Copy the systemd unit files before they are removed**

```bash
B=/mnt/data/backups/pre-coolify-2026-08-28
sudo cp /etc/systemd/system/auto-hub.service \
        /etc/systemd/system/auto-hub-watchdog.service \
        /etc/systemd/system/auto-hub-watchdog.timer "$B/"
sudo chown "$USER":"$USER" "$B"/auto-hub*.service "$B"/auto-hub*.timer
```
Verify: `ls -l "$B"/auto-hub*` shows three files.

- [ ] **Step 2: [agent] Dump all Postgres databases**

The stack is still running at this point.
```bash
cd /home/dama/repo/auto-hub
docker compose exec -T postgres pg_dumpall -U autohub > /mnt/data/backups/pre-coolify-2026-08-28/pgdumpall.sql
```
Verify:
```bash
grep -c 'CREATE DATABASE\|\\connect' /mnt/data/backups/pre-coolify-2026-08-28/pgdumpall.sql
tail -1 /mnt/data/backups/pre-coolify-2026-08-28/pgdumpall.sql
```
Expected: the grep count is ≥ 2 (at least the `autohub` and `n8n` databases), and the last line is `--\n-- PostgreSQL database cluster dump complete\n--` (i.e. the file ends cleanly, not mid-statement).

- [ ] **Step 3: [agent] Tar the n8n and mails volumes**

```bash
B=/mnt/data/backups/pre-coolify-2026-08-28
docker run --rm -v auto-hub_n8n_data:/v  -v "$B":/b alpine tar czf /b/n8n_data.tgz  -C /v .
docker run --rm -v auto-hub_mails_data:/v -v "$B":/b alpine tar czf /b/mails_data.tgz -C /v .
```
Verify:
```bash
tar tzf "$B/n8n_data.tgz"  | grep -q 'config\|database.sqlite\|\.n8n' && echo "n8n OK"
tar tzf "$B/mails_data.tgz" | grep -q 'mails.db' && echo "mails OK"
ls -lh "$B"/*.tgz
```
Expected: `n8n OK` and `mails OK` both print; both tarballs are > 0 bytes.

- [ ] **Step 4: [agent] Copy the secrets file**

```bash
cp /home/dama/repo/auto-hub/.env /mnt/data/backups/pre-coolify-2026-08-28/autohub.env
```
Verify: `grep -c '=' /mnt/data/backups/pre-coolify-2026-08-28/autohub.env` prints `12` (the 12 keys: DOMAIN, FRONTEND_URL, ADMIN_PASSWORD, JWT_SECRET, POSTGRES_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, N8N_API_KEY, CLOUDFLARE_TUNNEL_TOKEN, TIMEZONE, PLUGIN_DIR, GH_TOKEN).

- [ ] **Step 5: Checkpoint**

Run: `ls -lh /mnt/data/backups/pre-coolify-2026-08-28/`
Expected: `pgdumpall.sql`, `n8n_data.tgz`, `mails_data.tgz`, `autohub.env`, `auto-hub.service`, `auto-hub-watchdog.service`, `auto-hub-watchdog.timer`, `baseline.txt` all present. **Do not proceed past this task until every file is confirmed.**

---

### Task 3: Repo changes on `coolify-migration`

**Files:**
- Modify: `docker-compose.yml` (currently: nginx `ports` at lines 119–120; `cloudflared:` block at lines 133–142; top-level `volumes:` at lines 144–147)

**Interfaces:**
- Consumes: nothing.
- Produces: a `docker-compose.yml` on branch `coolify-migration` that (a) publishes no host port from `nginx`, (b) has no `cloudflared` service, (c) declares `postgres_data` / `n8n_data` / `mails_data` as external volumes named `auto-hub_postgres_data` / `auto-hub_n8n_data` / `auto-hub_mails_data`. Task 11 deploys this branch via Coolify.

- [ ] **Step 1: [agent] Confirm you are on the migration branch**

Run: `cd /home/dama/repo/auto-hub && git branch --show-current`
Expected: `coolify-migration`. If not: `git checkout coolify-migration` (it was created when the design doc was committed).

- [ ] **Step 2: [agent] Replace the `nginx` host port publish with `expose`**

In `docker-compose.yml`, change:
```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
```
to:
```yaml
  nginx:
    image: nginx:alpine
    expose:
      - "80"
```

- [ ] **Step 3: [agent] Delete the `cloudflared` service block**

Remove these lines entirely:
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
      TUNNEL_TRANSPORT_PROTOCOL: http2
    network_mode: host
    depends_on:
      - nginx
    restart: always
```
The `nginx` service's `depends_on` does not list `cloudflared`, so no further edit is needed there. Leave one blank line between the `nginx` block and `volumes:`.

- [ ] **Step 4: [agent] Declare the three volumes as external**

Change:
```yaml
volumes:
  postgres_data:
  n8n_data:
  mails_data:
```
to:
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

- [ ] **Step 5: [agent] Validate the compose file parses**

Run: `cd /home/dama/repo/auto-hub && docker compose config >/dev/null && echo VALID`
Expected: `VALID` and no warning about `cloudflared`. If it prints `service "cloudflared" ... `, the block was not fully removed.

- [ ] **Step 6: [agent] Confirm the intended diff**

Run: `git diff docker-compose.yml`
Expected: exactly three hunks — `ports`→`expose` on nginx, the removed `cloudflared:` block, and the three `external: true` volume declarations. Nothing else.

- [ ] **Step 7: [agent] Commit and push**

```bash
cd /home/dama/repo/auto-hub
git add docker-compose.yml
git commit -m "$(printf 'chore: prepare compose for Coolify management\n\n- nginx: expose :80 instead of publishing to host (Coolify Traefik fronts it)\n- remove in-stack cloudflared (moves to its own Coolify resource)\n- declare postgres/n8n/mails volumes as external, reusing auto-hub_* volumes\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01QSZvhZx2vKuhGBbERsF5Xp')"
git push -u origin coolify-migration
```
Verify: `git status` shows `Your branch is up to date with 'origin/coolify-migration'`.

---

### Task 4: Tear down the current stack

**Files:**
- Delete: `/etc/systemd/system/auto-hub.service`, `/etc/systemd/system/auto-hub-watchdog.service`, `/etc/systemd/system/auto-hub-watchdog.timer`

**Interfaces:**
- Consumes: the systemd unit backups from Task 2 Step 1 (rollback path).
- Produces: no AutoHub containers running, host `:80` free, the three data volumes still present. Coolify install in Task 7 needs `:80` free.

- [ ] **Step 1: [operator: sudo] Disable and stop the systemd units**

```bash
sudo systemctl disable --now auto-hub.service auto-hub-watchdog.timer auto-hub-watchdog.service
```
Verify: `systemctl is-active auto-hub.service` prints `inactive` (or `failed`), and `systemctl is-enabled auto-hub.service` prints `disabled`.

- [ ] **Step 2: [agent] Bring the compose stack down (NO `-v`)**

```bash
cd /home/dama/repo/auto-hub
docker compose down --remove-orphans
```
Note: `docker compose` here reads the working-tree `docker-compose.yml`, which on `coolify-migration` already has volumes marked `external` — `down` will not remove them regardless, and **`-v` must not be added**.
Verify: `docker ps -a --filter name=auto-hub --format '{{.Names}}'` prints nothing.

- [ ] **Step 3: [agent] Confirm the data volumes survived**

Run: `docker volume ls --format '{{.Name}}' | grep auto-hub`
Expected: `auto-hub_mails_data`, `auto-hub_n8n_data`, `auto-hub_plugins_data`, `auto-hub_postgres_data` still listed.

- [ ] **Step 4: [operator: sudo] Remove the unit files**

```bash
sudo rm /etc/systemd/system/auto-hub.service \
        /etc/systemd/system/auto-hub-watchdog.service \
        /etc/systemd/system/auto-hub-watchdog.timer
sudo systemctl daemon-reload
```
Verify: `ls /etc/systemd/system/auto-hub* 2>/dev/null` prints nothing.

- [ ] **Step 5: [agent] Confirm port 80 is free**

Run: `ss -tlnp | grep ':80 ' || echo 'PORT 80 FREE'`
Expected: `PORT 80 FREE`.

- [ ] **Step 6: Checkpoint**

No commit. State: no AutoHub containers, no auto-hub systemd units, `:80` free, data volumes intact.

---

### Task 5: SSD leftover cleanup

**Files:**
- Create: `$B/ssd-dotfiles.tgz`, `$B/dot-claude.tgz`, `$B/FILE-SEVER.tgz`
- Delete (from `/mnt/data/`): `.bash_history`, `.profile`, `.zshrc`, `.tmux.conf`, `.terminal-sessions.json`, `.cache/`, `.config/`, `.local/`, `.npm/`, `FILE-SEVER/`
- Keep untouched: `.claude/`, `.claude.json`, `github/`, `docker/`, `containerd/`, `lost+found/`

**Interfaces:**
- Consumes: `$B` from Task 1.
- Produces: a tidy `/mnt/data/` root. `.claude*` is archived but left in place pending confirmation it is not a live terminal-service profile store.

- [ ] **Step 1: [agent] Archive the stale shell dotfiles**

```bash
B=/mnt/data/backups/pre-coolify-2026-08-28
cd /mnt/data
tar czf "$B/ssd-dotfiles.tgz" \
  .bash_history .profile .zshrc .tmux.conf .terminal-sessions.json \
  .cache .config .local .npm 2>/dev/null || true
tar czf "$B/dot-claude.tgz" .claude .claude.json 2>/dev/null || true
```
Verify:
```bash
tar tzf "$B/ssd-dotfiles.tgz" | head
tar tzf "$B/dot-claude.tgz"   | head
ls -lh "$B"/ssd-dotfiles.tgz "$B"/dot-claude.tgz
```
Expected: both archives list files and are > 0 bytes.

- [ ] **Step 2: [operator: sudo] Archive `FILE-SEVER/` (root-owned)**

```bash
B=/mnt/data/backups/pre-coolify-2026-08-28
sudo tar czf "$B/FILE-SEVER.tgz" -C /mnt/data FILE-SEVER
sudo chown "$USER":"$USER" "$B/FILE-SEVER.tgz"
```
Verify: `tar tzf "$B/FILE-SEVER.tgz"` lists `FILE-SEVER/IMG_5243.mp4`, `FILE-SEVER/IMG_5862.mov`, `FILE-SEVER/test2.mp4`, `FILE-SEVER/Instructions for External Applicants.pdf`.

- [ ] **Step 3: [agent] Delete the stale dotfiles**

```bash
cd /mnt/data
rm -f  .bash_history .profile .zshrc .tmux.conf .terminal-sessions.json
rm -rf .cache .config .local .npm
```
Verify: `ls -a /mnt/data | grep -E '^\.(cache|config|local|npm|bash_history|profile|zshrc|tmux\.conf|terminal-sessions\.json)$' || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 4: [operator: sudo] Delete `FILE-SEVER/`**

```bash
sudo rm -rf /mnt/data/FILE-SEVER
```
Verify: `ls -d /mnt/data/FILE-SEVER 2>/dev/null || echo GONE`
Expected: `GONE`.

- [ ] **Step 5: [agent] Confirm the keepers are still there**

Run: `ls -d /mnt/data/{github,docker,containerd,lost+found,.claude,.claude.json} 2>/dev/null`
Expected: all six paths listed. `.claude/` and `.claude.json` are intentionally retained (archived only).

- [ ] **Step 6: Checkpoint**

No commit. `/mnt/data/` root now holds only `github/`, `docker/`, `containerd/`, `lost+found/`, `backups/`, `.claude/`, `.claude.json`.

---

### Task 6: Remove build leftovers

**Files:** none (Docker state only).

**Interfaces:**
- Consumes: nothing.
- Produces: reclaimed SSD space; the five `auto-hub-*` built images and the stale `auto-hub_plugins_data` volume are gone; the three data volumes and upstream base images remain.

- [ ] **Step 1: [agent] Remove the locally built AutoHub images**

```bash
docker image rm auto-hub-backend auto-hub-frontend auto-hub-terminal auto-hub-files auto-hub-mails 2>/dev/null || true
```
Verify: `docker image ls --format '{{.Repository}}' | grep '^auto-hub-' || echo 'NO AUTOHUB IMAGES'`
Expected: `NO AUTOHUB IMAGES`.

- [ ] **Step 2: [agent] Remove ONLY the stale plugins volume**

```bash
docker volume rm auto-hub_plugins_data
```
Expected output: `auto-hub_plugins_data`.
Verify (guard): `docker volume ls --format '{{.Name}}' | grep -E 'auto-hub_(postgres|n8n|mails)_data' | wc -l` prints `3`. If it prints anything other than 3, **stop** — a data volume was removed; go to the Rollback appendix.

- [ ] **Step 3: [agent] Prune build cache and dangling/unreferenced images (NOT volumes)**

```bash
docker builder prune -af
docker image prune -af
docker network prune -f
```
Note: none of these touch volumes. Do **not** add `--volumes` and do **not** run `docker system prune --volumes`.
Verify: `docker volume ls --format '{{.Name}}' | grep auto-hub` still lists the three `_data` volumes.

- [ ] **Step 4: [agent] Record reclaimed space**

Run: `df -h /mnt/data | tail -1`
Expected: `Avail` is ≥ the value recorded in `$B/baseline.txt` (space freed, not consumed).

- [ ] **Step 5: Checkpoint**

No commit.

---

### Task 7: Install Coolify

**Files:**
- Create: `/mnt/data/coolify/` (Coolify data root), `/data/coolify` → `/mnt/data/coolify` (symlink)

**Interfaces:**
- Consumes: free host `:80` from Task 4.
- Produces: `coolify`, `coolify-db`, `coolify-realtime`, `coolify-redis`, `coolify-proxy` (Traefik) containers running; dashboard on `http://<pi-lan-ip>:8000`.

- [ ] **Step 1: [operator: sudo] Point Coolify's data dir at the SSD**

```bash
sudo mkdir -p /mnt/data/coolify
sudo ln -sfn /mnt/data/coolify /data/coolify
```
Verify: `readlink /data/coolify` prints `/mnt/data/coolify`.

- [ ] **Step 2: [operator: sudo] Run the Coolify installer**

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```
This takes several minutes. It detects the existing Docker and `aarch64`, pulls the Coolify images, and starts the stack. It prints the dashboard URL and an initial setup path at the end.
Verify:
```bash
docker ps --format '{{.Names}}' | grep -E '^coolify'
```
Expected: at least `coolify`, `coolify-db`, `coolify-proxy` listed.

- [ ] **Step 3: [agent] Confirm Coolify data landed on the SSD**

Run: `ls /mnt/data/coolify/ && readlink /data/coolify`
Expected: `/mnt/data/coolify/` is non-empty (e.g. `source/`, `ssh/`, `applications/`), and the symlink resolves to it.

- [ ] **Step 4: [agent] Confirm Traefik took `:80`/`:443` and the dashboard answers**

```bash
ss -tlnp | grep -E ':80 |:443 |:8000 '
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000
```
Expected: listeners on `:80`, `:443`, `:8000`; the curl prints `200` or `302`.

- [ ] **Step 5: Checkpoint**

No commit. Coolify is up but unconfigured.

---

### Task 8: Coolify initial configuration

**Files:** none (Coolify UI state).

**Interfaces:**
- Consumes: the dashboard from Task 7.
- Produces: an owner account; instance domain `coolify.serenedge.com` with SSL off; `localhost` registered as a server (Coolify does this automatically).

- [ ] **Step 1: [operator: browser] Create the owner account**

Open `http://<pi-lan-ip>:8000`. Register the first user (name, email, password). This account is the instance owner.
Verify: you land on the Coolify dashboard.

- [ ] **Step 2: [operator: browser] Set the instance domain**

**Settings → Configuration** (or "General"):
- **Instance's Domain / FQDN:** `coolify.serenedge.com`
- **Generate SSL certificate / Let's Encrypt:** **OFF**
- Save. Coolify writes a Traefik router that maps `coolify.serenedge.com` → the dashboard.

Verify: from the Pi, `curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: coolify.serenedge.com' http://localhost` prints `200` or `302` (Traefik now knows the host).

- [ ] **Step 3: [operator: browser] Confirm the localhost server**

**Servers** → there is a `localhost` entry, status reachable/validated. No action needed; just confirm.

- [ ] **Step 4: Checkpoint**

No commit.

---

### Task 9: Cloudflare — add the Coolify public hostname

**Files:** none (Cloudflare dashboard state).

**Interfaces:**
- Consumes: the existing tunnel `0c35e8a8-…`.
- Produces: tunnel ingress `coolify.serenedge.com → http://localhost:80` (Host header `coolify.serenedge.com`); a proxied `CNAME coolify → 0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com`. `autohub.serenedge.com` ingress is left exactly as-is.

- [ ] **Step 1: [operator: browser] Open the tunnel**

`one.dash.cloudflare.com` → **Networks → Tunnels** → open the tunnel with ID starting `0c35e8a8` (status HEALTHY) → **Public Hostname** tab. Confirm the existing `autohub.serenedge.com → HTTP localhost:80` row and **do not touch it**.

- [ ] **Step 2: [operator: browser] Add `coolify.serenedge.com`**

**+ Add a public hostname:**
- Subdomain: `coolify`
- Domain: `serenedge.com`
- Path: *(leave empty)*
- Service Type: `HTTP`
- URL: `localhost:80`

Expand **Additional application settings → HTTP Settings → HTTP Host Header:** `coolify.serenedge.com`. Save.

- [ ] **Step 3: [operator: browser] Verify DNS**

`dash.cloudflare.com` → `serenedge.com` → **DNS → Records**. Confirm both rows exist and are **Proxied** (orange cloud):

| Type | Name | Target |
|---|---|---|
| CNAME | `autohub` | `0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com` |
| CNAME | `coolify` | `0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com` |

If `coolify` is missing, add it manually: **+ Add record** → Type `CNAME`, Name `coolify`, Target `0c35e8a8-faa9-4dfd-a40a-6945eb79b153.cfargotunnel.com`, Proxy **Proxied**, TTL Auto.

- [ ] **Step 4: [operator: browser] Confirm TLS mode**

`serenedge.com` → **SSL/TLS → Overview**. Mode must read **Full**. If it is Flexible or Full (strict), set it to **Full**.

- [ ] **Step 5: [agent] Verify public DNS resolves**

Run: `dig +short coolify.serenedge.com`
Expected: returns Cloudflare proxy IPs (e.g. `104.x` / `172.67.x`), not `NXDOMAIN`. May take 1–2 minutes to propagate.

- [ ] **Step 6: Checkpoint**

No commit. `https://coolify.serenedge.com` may not fully load yet — that is expected until Task 10 gives the tunnel its running `cloudflared`.

Wait — the *current* `cloudflared` container was stopped in Task 4, so the tunnel has no connector right now. That is fine; Task 10 restores it.

---

### Task 10: Deploy `cloudflared` as a Coolify resource

**Files:** none (Coolify UI state; compose defined inline in Coolify).

**Interfaces:**
- Consumes: `CLOUDFLARE_TUNNEL_TOKEN` from `$B/autohub.env`.
- Produces: a running `cloudflared` connector on the host network; tunnel status HEALTHY in Cloudflare; `https://coolify.serenedge.com` fully loads.

- [ ] **Step 1: [operator: browser] Create the project and the resource**

Coolify → **Projects → + Add** → name `autohub`, environment `production`.
Inside it → **+ New Resource → Docker Compose** (empty/raw). Name it `cloudflared`. Paste:
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

- [ ] **Step 2: [operator: browser] Set the token env var**

On the resource's **Environment Variables** tab, add:
- Key: `CLOUDFLARE_TUNNEL_TOKEN`
- Value: the `CLOUDFLARE_TUNNEL_TOKEN=` value from `/mnt/data/backups/pre-coolify-2026-08-28/autohub.env` (everything after the `=`).
- Mark it "Build Variable" if Coolify offers the toggle, so it is available at compose-interpolation time.

- [ ] **Step 3: [operator: browser] Deploy**

Click **Deploy**. Watch the deployment log until it shows the container started.

- [ ] **Step 4: [agent] Verify the connector is running and healthy**

```bash
docker ps --format '{{.Names}}' | grep -i cloudflared
CF=$(docker ps --format '{{.Names}}' | grep -i cloudflared | head -1)
docker logs "$CF" 2>&1 | grep -E 'Registered tunnel connection|Updated to new configuration' | tail -5
```
Expected: the container is listed; logs show `Registered tunnel connection` (usually 4×) and an `Updated to new configuration` line containing both `autohub.serenedge.com` and `coolify.serenedge.com` in the ingress JSON.

- [ ] **Step 5: [operator: browser] Confirm in Cloudflare**

Tunnel page → status **HEALTHY**, connector count ≥ 1.

- [ ] **Step 6: [agent] Verify the dashboard is reachable over the tunnel**

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://coolify.serenedge.com`
Expected: `200` or `302`. If `530`/`1033`, the tunnel has no connector — recheck Step 4. If `404` from Traefik, recheck Task 8 Step 2 (instance domain).

- [ ] **Step 7: Checkpoint**

No commit. `autohub.serenedge.com` over the tunnel will return a Traefik `404` until Task 11 — expected.

---

### Task 11: Deploy `auto-hub` as a Coolify resource from git

**Files:** none (Coolify UI state; deploys the `coolify-migration` branch pushed in Task 3).

**Interfaces:**
- Consumes: the pushed `coolify-migration` branch; the 11 non-tunnel env keys from `$B/autohub.env`; the existing `auto-hub_*` data volumes (via `external: true` in the committed compose).
- Produces: the full AutoHub stack running under Coolify; `nginx` fronted by Traefik at `autohub.serenedge.com`; Postgres attached to the pre-existing data.

- [ ] **Step 1: [operator: browser] Create the resource**

Project `autohub` → **+ New Resource → Public Repository** (or **Docker Compose → Git**).
- Repository URL: `https://github.com/DahamDissanayake/auto-hub`
- Branch: `coolify-migration`
- Build Pack: **Docker Compose**
- Docker Compose Location: `/docker-compose.yml`
- Name the resource `auto-hub`.
- Save.

- [ ] **Step 2: [operator: browser] Add environment variables**

On the resource's **Environment Variables** tab, add each of these with the value taken from `/mnt/data/backups/pre-coolify-2026-08-28/autohub.env` (do **not** add `CLOUDFLARE_TUNNEL_TOKEN`):

```
DOMAIN
FRONTEND_URL
ADMIN_PASSWORD
JWT_SECRET
POSTGRES_PASSWORD
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
N8N_API_KEY
TIMEZONE
PLUGIN_DIR
GH_TOKEN
```
If Coolify distinguishes build-time vs runtime vars, mark all of them available at both (the compose file interpolates `${...}` at parse time).

- [ ] **Step 3: [operator: browser] Set the `nginx` service domain**

In the resource's service/domain configuration, for the **`nginx`** service:
- Domain: `http://autohub.serenedge.com`
- Port: `80`
- SSL / Let's Encrypt: **OFF**

Leave every other service (`frontend`, `backend`, `n8n`, `terminal`, `files`, `mails`, `postgres`, `redis`) with **no** domain.

- [ ] **Step 4: [operator: browser] Deploy**

Click **Deploy**. The first ARM build (NestJS + two Next.js builds) takes ~10–20 minutes. Watch the log for each image building, then `Container ... Started` for all services.

- [ ] **Step 5: [agent] Verify Postgres attached to the EXISTING data (critical)**

```bash
PG=$(docker ps --format '{{.Names}}' | grep -E 'postgres' | grep -v coolify | head -1)
docker logs "$PG" 2>&1 | grep -iE 'database system is ready|initdb|creating (initial )?database' | tail -5
docker inspect "$PG" --format '{{json .Mounts}}' | tr ',' '\n' | grep -E 'auto-hub_postgres_data|Source'
```
Expected: logs say **`database system is ready to accept connections`** and contain **no** `initdb` / "creating initial database" line. The mount source references `auto-hub_postgres_data`.
If you see `initdb` / "creating initial database": **stop**. The external-volume wiring failed (Coolify created a new empty volume). Fix: down the resource, verify the committed compose has `external: true` + `name:`, check `docker volume ls` for a stray `<coolify-project>_postgres_data`, remove only that stray empty one, redeploy. Do not let the app write to the empty DB.

- [ ] **Step 6: [agent] Verify the data is actually there**

```bash
PG=$(docker ps --format '{{.Names}}' | grep -E 'postgres' | grep -v coolify | head -1)
docker exec "$PG" psql -U autohub -d autohub -c '\dt' | tail -5
docker exec "$PG" psql -U autohub -d n8n -c '\dt' | tail -5
```
Expected: both commands list real tables (AutoHub schema; n8n schema), **not** "Did not find any relations."

- [ ] **Step 7: [agent] Verify all AutoHub services are up**

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep -viE 'coolify' | grep -E 'nginx|frontend|backend|n8n|terminal|files|mails|postgres|redis'
```
Expected: nine lines, all `Up`. `terminal` should reach `(healthy)` within a minute.

- [ ] **Step 8: Checkpoint**

No commit. Proceed to full end-to-end verification.

---

### Task 12: End-to-end verification & reboot test

**Files:** none.

**Interfaces:**
- Consumes: the running Coolify + AutoHub + cloudflared.
- Produces: signed-off confirmation the migration works and survives a reboot.

- [ ] **Step 1: [agent] Public routing — AutoHub**

```bash
for p in "/" "/api/" "/n8n/" "/files-api/" "/mails-api/"; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://autohub.serenedge.com$p"
done
```
Expected: `/` → `200`; `/api/` → `200` or `404`-from-app (not `502`/`503`); `/n8n/` → `401` (basic-auth challenge); `/files-api/` and `/mails-api/` → `200`/`401`/`404` from the app, not a gateway error. Any `502`/`503`/`530` is a failure — check the corresponding container's logs.

- [ ] **Step 2: [operator: browser] Manual smoke test**

- `https://autohub.serenedge.com` — frontend loads, log in with `ADMIN_PASSWORD`.
- Dashboard shows the container list and system metrics (backend ↔ docker.sock works).
- Open the web terminal — a shell connects (terminal WebSocket via `/terminal-ws/`).
- Open the Files app — the tree lists `/roots/*`.
- Open the Mails app — existing mail/threads present (mails volume reattached).
- Open n8n (`/n8n/`, basic-auth) — existing workflows present (n8n DB + volume reattached).
- `https://coolify.serenedge.com` — Coolify dashboard loads over HTTPS.

- [ ] **Step 3: [operator: sudo] Reboot the Pi**

```bash
sudo reboot
```

- [ ] **Step 4: [agent] After the Pi is back — verify auto-start**

Wait ~2 minutes, reconnect, then:
```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'coolify|nginx|backend|postgres|cloudflared'
curl -s -o /dev/null -w 'autohub %{http_code}\n' https://autohub.serenedge.com/
curl -s -o /dev/null -w 'coolify %{http_code}\n' https://coolify.serenedge.com/
```
Expected: Coolify stack, AutoHub stack, and `cloudflared` all `Up` without manual intervention; both curls `200`/`302`.

- [ ] **Step 5: Checkpoint**

No commit. If everything passes, proceed to promotion. If not, use the Rollback appendix.

---

### Task 13: Promote to `main`, repoint Coolify, tidy the repo

**Files:**
- Modify: none functionally — merge `coolify-migration` → `main`.
- Delete: `tmux-client-20516.log`, `tmux-server-20518.log` (untracked cruft in the repo root)
- Modify: `.gitignore` (add a `tmux-*.log` rule), `README.md` (replace the retired scripts/systemd section with the Coolify workflow)

**Interfaces:**
- Consumes: a verified deployment on the `coolify-migration` branch.
- Produces: `main` carrying the Coolify-ready compose; Coolify's `auto-hub` resource tracking `main`; the repo root free of stray logs.

- [ ] **Step 1: [agent] Update `.gitignore`**

Append to `/home/dama/repo/auto-hub/.gitignore`:
```
# stray tmux capture logs
tmux-*.log
```

- [ ] **Step 2: [agent] Remove the stray log files**

```bash
cd /home/dama/repo/auto-hub
rm -f tmux-client-20516.log tmux-server-20518.log
```
Verify: `git status --porcelain` shows only the `.gitignore` change (plus README in the next step).

- [ ] **Step 3: [agent] Rewrite the deployment section of `README.md`**

Replace the `## Scripts`, `### Watchdog cron`, and `## Updating` sections (the ones referencing `scripts/install.sh`, `scripts/deploy.sh`, `scripts/watchdog.sh`, and `docker compose up -d --build`) with:

```markdown
## Deployment

AutoHub runs as a Coolify resource on the Pi.

- **Host:** Coolify manages the Docker stack. Dashboard: https://coolify.serenedge.com
- **Deploy a change:** push to `main` (Coolify auto-deploys) or click **Redeploy** on the
  `auto-hub` resource in Coolify.
- **Public access:** Cloudflare Tunnel → Coolify Traefik → this stack's `nginx`
  (`autohub.serenedge.com`). `cloudflared` is a separate Coolify resource.
- **Data:** `postgres_data`, `n8n_data`, `mails_data` are external Docker volumes
  (`auto-hub_*`), preserved across redeploys.
- **Env vars:** set on the `auto-hub` resource in Coolify (not a committed `.env`).
- **Migration record:** `docs/superpowers/specs/2026-08-28-coolify-migration-design.md`.
```

Leave `## Day-to-day commands` and `## Troubleshooting` in place but drop any line that calls `scripts/deploy.sh`.
Verify: `grep -n 'deploy.sh\|watchdog.sh\|install.sh' README.md` prints nothing.

- [ ] **Step 4: [agent] Retire the scripts**

```bash
cd /home/dama/repo/auto-hub
git rm scripts/deploy.sh scripts/install.sh scripts/watchdog.sh
```
Verify: `ls scripts/ 2>/dev/null || echo 'scripts/ gone'` — directory is empty or gone.

- [ ] **Step 5: [agent] Commit on the branch**

```bash
cd /home/dama/repo/auto-hub
git add -A
git commit -m "$(printf 'chore: retire systemd/compose deploy path, document Coolify\n\n- remove scripts/{install,deploy,watchdog}.sh (superseded by Coolify)\n- README: Coolify deployment section\n- gitignore stray tmux-*.log\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01QSZvhZx2vKuhGBbERsF5Xp')"
git push
```

- [ ] **Step 6: [agent] Merge to `main`**

```bash
cd /home/dama/repo/auto-hub
git checkout main
git merge --no-ff coolify-migration -m "$(printf 'Merge branch coolify-migration\n\nMigrate the Pi to Coolify-managed deployment. See\ndocs/superpowers/specs/2026-08-28-coolify-migration-design.md\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01QSZvhZx2vKuhGBbERsF5Xp')"
git push origin main
```

- [ ] **Step 7: [operator: browser] Repoint Coolify at `main`**

`auto-hub` resource → **Configuration → Source/Branch** → change branch from `coolify-migration` to `main` → Save → **Redeploy**.
Verify (agent): after redeploy, `curl -s -o /dev/null -w '%{http_code}\n' https://autohub.serenedge.com/` prints `200`, and Task 12 Step 5's Postgres check still shows `database system is ready` with no `initdb`.

- [ ] **Step 8: [agent] Delete the migration branch**

```bash
cd /home/dama/repo/auto-hub
git branch -d coolify-migration
git push origin --delete coolify-migration
```

- [ ] **Step 9: Final checkpoint**

`main` is deployed via Coolify, verified, and reboot-safe. Backups remain in `/mnt/data/backups/pre-coolify-2026-08-28/` — keep them at least 7 days, then the operator may delete `FILE-SEVER.tgz` and the rest.

---

## Rollback appendix

Trigger this if Task 11 or Task 12 fails and cannot be fixed forward. Nothing before Task 11 writes to the data volumes or changes the tunnel token, so rollback is low-risk.

1. **[operator: browser]** Coolify → `auto-hub` resource → **Stop** (and Stop `cloudflared` too if reverting fully).
2. **[operator: sudo]** Free `:80` for AutoHub's own nginx:
   ```bash
   docker stop coolify-proxy
   ```
3. **[agent]** Restore the repo working tree:
   ```bash
   cd /home/dama/repo/auto-hub
   git checkout main            # main still has the pre-migration compose until Task 13
   ```
4. **[operator: sudo]** Reinstate the systemd units from backup:
   ```bash
   B=/mnt/data/backups/pre-coolify-2026-08-28
   sudo cp "$B"/auto-hub.service "$B"/auto-hub-watchdog.service "$B"/auto-hub-watchdog.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now auto-hub.service auto-hub-watchdog.timer
   ```
5. **[agent]** Confirm recovery:
   ```bash
   docker compose ps
   curl -s -o /dev/null -w '%{http_code}\n' https://autohub.serenedge.com/
   ```
   Expected: all AutoHub services `Up`; curl `200` (the old in-stack `cloudflared` came back with the stack and the tunnel ingress still points `autohub.serenedge.com → localhost:80`).
6. **Only if a data volume was emptied:** stop the stack, then restore:
   ```bash
   B=/mnt/data/backups/pre-coolify-2026-08-28
   # Postgres:
   docker compose up -d postgres && sleep 10
   cat "$B/pgdumpall.sql" | docker compose exec -T postgres psql -U autohub -d postgres
   # n8n / mails volumes:
   docker run --rm -v auto-hub_n8n_data:/v  -v "$B":/b alpine sh -c 'cd /v && rm -rf ./* && tar xzf /b/n8n_data.tgz'
   docker run --rm -v auto-hub_mails_data:/v -v "$B":/b alpine sh -c 'cd /v && rm -rf ./* && tar xzf /b/mails_data.tgz'
   docker compose up -d
   ```
7. Coolify can be left installed (stopped) for a later retry, or removed with `curl -fsSL https://cdn.coollabs.io/coolify/uninstall.sh | sudo bash`.
