# AutoHub — Security Check #1

**Date:** 2026-06-21
**Reviewer:** Claude (Opus 4.8) — full-repo manual audit
**Scope:** backend (NestJS), terminal service, files service, nginx, docker-compose, scripts, secrets handling

---

## 0. Threat model (read this first)

AutoHub is a **single-admin, self-hosted automation hub** running on a Raspberry Pi, exposed
to the internet through a **Cloudflare Tunnel**. By design it is a *remote host-administration
tool*: it offers a web terminal (full shell), Docker control, and a host reboot/shutdown plugin.

That design choice frames every finding below. "Remote code execution via the terminal" is the
**product**, not a bug. So the audit does **not** try to remove power — it focuses on:

1. **The front door** — the auth that stands between the internet and total host control.
2. **Blast radius** — how much a *single* compromise (stolen token, one weak secret, one bad
   plugin) hands over, and where that can be cheaply reduced.
3. **Secret exposure** — secrets sitting in places they don't need to be.

**Core observation:** the entire system collapses to a single trust decision. Anyone who holds a
valid admin JWT, knows `ADMIN_PASSWORD`, or knows the nginx basic-auth password gets, within one
or two steps, **root on the host**:

- terminal → interactive shell as `dama`, with `/home/dama` mounted read-write and `GH_TOKEN` in env;
- backend → the Docker socket **and** the entire host filesystem at `/host`;
- the `host-control` plugin → a privileged `PidMode: host` container that runs `nsenter … reboot`.

Therefore the highest-value hardening is concentrated on **secret strength, secret storage, and
the authentication surface** — not on the individual feature endpoints, which are all equally
"god mode" once you are past the door.

---

## 1. Findings summary

| # | Severity | Finding | Verdict |
|---|----------|---------|---------|
| 1 | **Critical** | Whole system reduces to one password + one JWT secret; no MFA, no scoping | **Necessary** (harden, don't redesign) |
| 2 | **High** | `docker.sock` mounted into `terminal` as `:ro` gives **full** Docker API (ro ≠ read-only API) | **Necessary** |
| 3 | **High** | Backend mounts entire host FS `/:/host:ro` — reads every host secret | **Recommended** (narrow the mount) |
| 4 | **High** | JWT travels in **query string** (terminal WS, `/download`, `/events`) → leaks to logs/history/Referer | **Recommended** |
| 5 | **Medium** | `.env` is world-readable (mode 664) with every secret in it | **Necessary** (one chmod) |
| 6 | **Medium** | n8n behind one shared `admin` + Apache-MD5 (`apr1`) htpasswd; no rate-limit on basic auth | **Recommended** |
| 7 | **Medium** | CSP allows `script-src 'self' 'unsafe-inline'` | **Optional** |
| 8 | **Medium** | `client_max_body_size 0` + no rate-limit on files/terminal services → disk-fill / resource DoS | **Recommended** |
| 9 | **Low** | Plugin password check uses non-constant-time plaintext `!==` | **Optional** |
| 10 | **Low** | `git clone` argument injection (url starting with `-`) | **Optional** (defense-in-depth) |
| 11 | **Low** | 7-day JWT, single secret shared across 3 services, no revocation | **Recommended** |
| 12 | **Low** | `Content-Disposition` filename not sanitized (header-injection-ish) | **Optional** |
| 13 | **Low** | Redis has no auth (internal network only) | **Accept / Optional** |
| 14 | **Info** | `install.sh` uses `curl \| sh`; no Helmet in backend; HTTP between containers | **Accept** |

Positive notes (already done right): secrets are **not** committed to git; `.env`/`htpasswd` are
git-ignored; passwords compared with `timingSafeEqual` / bcrypt in `auth.service`; TypeORM uses
parameterized queries (no SQL injection seen); `synchronize: false`; path-traversal guards in the
files service (`resolveSafePath`) and plugin loader (`assertPathWithinPluginDir` + `realpathSync`);
login is rate-limited (5/min); child processes use `execFile`/`spawn` with arg arrays (no shell)
throughout; input validation (regex allow-lists) on session/profile/workflow names.

---

## 2. Detailed findings

### 1. [Critical] Single credential = full host compromise
**Where:** `auth.service.ts`, `app.module.ts` (global `JwtAuthGuard`), `docker-compose.yml`.
**What:** All backend routes are protected by one global JWT guard; the only public route is
`/auth/login`, which checks a single `ADMIN_PASSWORD` and mints a 7-day token. The terminal and
files services verify the *same* `JWT_SECRET`. There is no second factor and no privilege
separation — the token that loads the dashboard is the same token that opens a root-capable shell.

**Impact:** One leaked/guessed password or one leaked `JWT_SECRET` ⇒ root on the Pi, plus the
Telegram bot token, GitHub token, and saved Claude OAuth credentials.

**Solution:**
- Generate `ADMIN_PASSWORD` and `JWT_SECRET` as long random values (`openssl rand -base64 32`).
  Store `ADMIN_PASSWORD` as a **bcrypt hash** — `auth.service` already supports `$2…` prefixes.
- Add a second factor (TOTP) on `/auth/login`, given the endpoint grants host control.
- Treat `JWT_SECRET` as the crown jewel: rotate on any suspicion; never log it.

**Verdict: NECESSARY.** This is the actual security boundary of the product. You are not removing
power, you are making the one door that matters hard to walk through. Do not skip the bcrypt +
strong-secret step. MFA is strongly recommended but a larger change.

---

### 2. [High] `docker.sock :ro` in the terminal container is **not** read-only
**Where:** `docker-compose.yml` → `terminal.volumes: /var/run/docker.sock:/var/run/docker.sock:ro`.
**What:** A `:ro` bind mount only makes the *socket file* read-only on disk. Docker API calls go
over the socket as a protocol — the `:ro` flag does **not** restrict them. The terminal can still
`POST /containers/create` with `Privileged: true` and escape to host root, exactly like the
`host-control` plugin does from the backend.

**Impact:** The terminal effectively has full host root via Docker, independent of its already-root
shell. More importantly, it's a footgun: the `:ro` reads as "safe" but isn't.

**Solution:**
- The terminal does not appear to need the Docker socket at all (its endpoints manage tmux, git,
  and Claude profiles). **Remove the mount.**
- Where Docker access *is* needed (the backend), put a **docker-socket-proxy**
  (e.g. `tecnativa/docker-socket-proxy`) in front and allow only the specific endpoints the
  dashboard uses (`GET /containers`, `POST …/restart|stop|start`). Block `/containers/create`,
  `/exec`, and `/images` so a compromised backend can't spawn privileged containers.

**Verdict: NECESSARY** (at least remove the terminal mount — it's free). The socket-proxy for the
backend is **Recommended**: it directly shrinks blast radius without removing any real feature.

---

### 3. [High] Backend mounts the entire host filesystem (`/:/host:ro`)
**Where:** `docker-compose.yml` → `backend.volumes: /:/host:ro`.
**What:** The whole host root is readable inside the backend. It is used only for system metrics
(`statfs('/host')`, `/host/proc/.../net/dev`). But it also exposes `/etc/shadow`, every user's SSH
keys, other apps' secrets, etc. to any code running in the backend — including the in-process
`require()`'d plugins.

**Impact:** Any backend RCE/SSRF or malicious plugin reads every secret on the box, not just
AutoHub's.

**Solution:** Mount only what the metrics need. Replace `/:/host:ro` with the narrow set actually
read — e.g. `/proc:/host/proc:ro` (and a specific data path for `statfs`). If full-disk free-space
on `/` is needed, mount `/` to a deep path and never pass user input near it (already the case).

**Verdict: RECOMMENDED.** Pure defense-in-depth; the feature still works with a far smaller mount.

---

### 4. [High] JWT in the query string (terminal WS, `/download`, `/events`)
**Where:** `terminal/src/server.js` (`params.get('token')`), `files/src/routes/download.ts`,
`files/src/routes/events.ts`.
**What:** Browsers can't attach an `Authorization` header to `EventSource` or `<a download>` links
or `new WebSocket()`, so the long-lived 7-day JWT is passed as `?token=…`. Query strings land in
nginx access logs, browser history, and `Referer` headers, and can be cached by intermediaries.

**Impact:** A token captured from any of those persists for up to 7 days and grants full access.

**Solution:**
- For downloads/events, issue a **short-lived (e.g. 60 s), single-purpose** token scoped to the one
  file/stream, instead of reusing the master 7-day token.
- For the WebSocket, pass the token via the `Sec-WebSocket-Protocol` subprotocol header instead of
  the URL, or via a short-lived cookie.
- Ensure nginx does not log query strings for these locations.

**Verdict: RECOMMENDED.** Real exposure given the token's power and lifetime; the short-lived-token
approach is the clean fix.

---

### 5. [Medium] `.env` is world-readable
**Where:** host `auto-hub/.env`, mode `-rw-rw-r--` (664).
**What:** Every secret (`JWT_SECRET`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `TELEGRAM_BOT_TOKEN`,
`GH_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`) is readable by any local user / any other container that
happens to bind-mount the repo.

**Solution:** `chmod 600 .env` (and `chmod 600 nginx/htpasswd`). Document it in `install.sh`.

**Verdict: NECESSARY.** One command, removes a real local-exposure path. (Not committed to git —
that part is already correct.)

---

### 6. [Medium] n8n basic auth: shared `admin` + weak `apr1` hash, no rate limiting
**Where:** `nginx/nginx.conf` (`/n8n/` `auth_basic`), `nginx/htpasswd` (`$apr1$…` = Apache MD5).
**What:** n8n is gated only by nginx basic auth using a single shared `admin` account hashed with
`apr1` (fast MD5-based — weak offline, and online attempts aren't rate-limited at the nginx layer).
n8n's own authentication appears to be relied-upon-via-nginx-only.

**Solution:**
- Rehash with bcrypt: `htpasswd -B -c nginx/htpasswd admin` and use a strong unique password.
- Enable n8n's **native** user management as well (defense in depth — don't rely solely on the
  proxy). Add a basic-auth rate limit (`limit_req`) on `/n8n/`.

**Verdict: RECOMMENDED.** n8n holds workflow credentials/webhooks; it deserves more than one weak
shared hash.

---

### 7. [Medium] CSP allows `script-src 'self' 'unsafe-inline'`
**Where:** `nginx/nginx.conf` (`Content-Security-Policy` on `/` and `/api/`).
**What:** `'unsafe-inline'` for scripts removes most of CSP's XSS value.
**Solution:** Move to nonce/hash-based script CSP (Next.js supports nonces), drop `'unsafe-inline'`.
**Verdict: OPTIONAL.** Worth doing, but lower priority than the auth/blast-radius items, and a
single-admin app has a smaller XSS audience. Tighten when convenient.

---

### 8. [Medium] Unlimited upload size + no rate limiting on files/terminal services
**Where:** `nginx/nginx.conf` (`/files-api/` `client_max_body_size 0`); only the backend has a
throttler — `terminal` and `files` services have none.
**What:** An authenticated client can fill the disk via uploads, or hammer the unauthenticated
`/health` endpoints / WS handshakes.
**Solution:** Set a sane `client_max_body_size` (e.g. matched to the largest legit upload), add an
`limit_req` zone for `/files-api/` and `/terminal-ws/`, and consider a disk-space guard before write.
**Verdict: RECOMMENDED.** Cheap DoS hardening; requires picking a real upload cap.

---

### 9. [Low] Plugin password check is non-constant-time plaintext compare
**Where:** `plugins.controller.ts` → `body.password !== adminPassword`.
**What:** The `requiresPassword` gate (used by `host-control`) compares the plaintext admin
password with `!==`, unlike `auth.service` which uses `timingSafeEqual`/bcrypt. Minor timing oracle,
and it ignores the bcrypt-hash case entirely.
**Solution:** Route this check through `AuthService` so it shares the constant-time / bcrypt logic.
**Verdict: OPTIONAL.** Low practical risk (already behind the JWT guard), but trivially consistent.

---

### 10. [Low] `git clone` argument injection
**Where:** `terminal/src/server.js` → `/clone`, when the URL is not a github.com match it is passed
straight as `git clone <url> <path>`.
**What:** A URL like `--upload-pack=…` would be parsed by git as an option, not a repo. Requires a
valid JWT — and a JWT holder already has a full shell — so marginal impact.
**Solution:** Reject URLs that start with `-`, or insert `--` before the URL: `git clone -- <url> <path>`.
**Verdict: OPTIONAL** (defense-in-depth; one-line fix).

---

### 11. [Low] 7-day JWT, single shared secret, no revocation
**Where:** `auth.module.ts` (`expiresIn: '7d'`), shared `JWT_SECRET` across backend/terminal/files.
**What:** A stolen token is valid for a week; there is no logout-all / revocation short of rotating
the secret (which logs everyone out and is shared by 3 services).
**Solution:** Shorten access-token lifetime (e.g. 1h) with a refresh flow, or add a server-side
token-version/denylist. Optionally use distinct audiences per service.
**Verdict: RECOMMENDED** but a bigger change; pair it with finding #4.

---

### 12. [Low] Download filename header not sanitized
**Where:** `files/src/routes/download.ts` → `Content-Disposition: attachment; filename="${basename}"`.
**What:** A filename containing `"` could break out of the quoted value. Node usually rejects CR/LF
in header values, so true header injection is unlikely, but the quoting is fragile.
**Solution:** Use `res.download()` / `encodeURIComponent` + `filename*=UTF-8''…`.
**Verdict: OPTIONAL.**

---

### 13. [Low] Redis has no authentication
**Where:** `docker-compose.yml` → `redis` (no password); used by BullMQ.
**What:** Any code on the Docker network can read/modify the job queue. Not internet-exposed.
**Solution:** Set `requirepass` and pass it in `REDIS_URL`, if/when other untrusted containers
share the network.
**Verdict: ACCEPT for now** (internal-only). Revisit if the network gains untrusted tenants.

---

### 14. [Info] Miscellaneous
- `install.sh` pipes `curl … | sh` to install Docker — standard upstream method but unverified;
  acceptable for a personal installer. **Accept.**
- Backend relies on nginx for security headers rather than Helmet — fine, since all responses pass
  through nginx, but adding Helmet would protect direct-container access. **Accept.**
- Container-to-container traffic is plain HTTP; TLS terminates at Cloudflare and the tunnel
  encrypts edge→`cloudflared`. The host's `:80` is still reachable on the LAN/host network — keep
  the host firewalled. **Accept / firewall.**

---

## 3. Prioritized action list

**Do now (necessary, cheap):**
1. `chmod 600 .env nginx/htpasswd` (#5).
2. Set strong random `JWT_SECRET` + bcrypt `ADMIN_PASSWORD`; confirm they are not defaults (#1).
3. Remove `docker.sock` from the `terminal` service (#2).

**Do soon (recommended, real blast-radius/exposure reduction):**
4. Narrow the backend `/:/host:ro` mount to just `/proc` + needed paths (#3).
5. Short-lived scoped tokens for `/download`, `/events`, and the terminal WS (#4).
6. bcrypt + strong password for n8n htpasswd; enable n8n native auth; rate-limit `/n8n/` (#6).
7. `client_max_body_size` cap + `limit_req` on files/terminal (#8).
8. docker-socket-proxy in front of the backend's Docker access (#2).

**Nice to have:**
9. Add TOTP/MFA to `/auth/login` (#1).
10. Shorten JWT lifetime + refresh/revocation (#11).
11. Nonce-based CSP (#7); constant-time plugin password check (#9); `git clone --` guard (#10);
    sanitized download filename (#12).

**Explicitly accepted (by design / low value):** terminal = RCE by design; redis internal-only
(#13); `curl|sh` installer, no Helmet, internal HTTP (#14).
