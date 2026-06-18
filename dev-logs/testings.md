# AutoHub Test Runbook

Run all commands from the project root on the Linux machine after transferring the code.

---

## Prerequisites

```bash
# Confirm Docker is running
docker --version
docker compose version

# Copy env file and set passwords
cp .env.example .env
# Edit ADMIN_PASSWORD, JWT_SECRET, POSTGRES_PASSWORD in .env
```

---

## Backend Unit Tests

Run from `backend/` directory.

```bash
cd backend
npm install
```

### Run all unit tests
```bash
npm test
```
Expected: All test suites pass. No failures.

### Run with coverage
```bash
npm run test:cov
```
Expected: Coverage report generated in `backend/coverage/`.

### Run individual test suites
```bash
npx jest src/auth/auth.service.spec.ts --no-coverage
npx jest src/notifications/notifications.service.spec.ts --no-coverage
npx jest src/plugins/plugins.service.spec.ts --no-coverage
npx jest src/scheduler/scheduler.service.spec.ts --no-coverage
npx jest src/n8n/n8n.service.spec.ts --no-coverage
npx jest src/dashboard/dashboard.service.spec.ts --no-coverage
```
Each expected: `PASS` with all tests passing.

---

## Backend E2E Tests

E2E tests require a real PostgreSQL and Redis instance.

### Option A: Run E2E against the Docker Compose stack

```bash
# Start the stack (backend + postgres + redis only)
docker compose up -d postgres redis

# Wait for postgres to be ready
sleep 5

# Set test env vars
export DATABASE_URL=postgresql://autohub:dbpassword@localhost:5432/autohub
export REDIS_URL=redis://localhost:6379
export ADMIN_PASSWORD=changeme
export JWT_SECRET=test-secret
export PLUGIN_DIR=/tmp/autohub-test-plugins

# Run e2e tests from backend/
cd backend
npm run test:e2e
```
Expected: All e2e scenarios pass.

### Option B: Run full Docker Compose and smoke test with curl

```bash
docker compose up -d --build
sleep 10

# Test health (no auth)
curl -s http://localhost/api/health | jq .
# Expected: {"status":"ok","version":"1.0.0",...}

# Test login
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"changeme"}' | jq -r .access_token)
echo "Token: $TOKEN"

# Test dashboard (requires auth)
curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq .stats
# Expected: {"totalPlugins":3,...}

# Test plugins list
curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | jq '.[].name'
# Expected: "Daily Summary", "System Health", "Webhook Ping"

# Run daily-summary plugin manually
PLUGIN_ID=$(curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')
curl -s -X POST "http://localhost/api/plugins/$PLUGIN_ID/run" \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"status":"success","output":"..."}

# Test n8n bridge (no key set → 503)
curl -s http://localhost/api/n8n/workflows \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"statusCode":503,"message":"N8N_API_KEY not configured"}

# Test unauthenticated access → 401
curl -s http://localhost/api/dashboard
# Expected: {"statusCode":401,"message":"Unauthorized"}
```

---

## Integration Smoke Test (Definition of Done)

After `docker compose up --build`, verify each item:

- [ ] `curl http://localhost` returns HTML (login page or redirect to /login)
- [ ] `curl http://localhost/api/health` returns `{"status":"ok",...}`
- [ ] Login with `ADMIN_PASSWORD` returns a JWT
- [ ] `GET /api/dashboard` with JWT returns stats
- [ ] `GET /api/plugins` with JWT returns 3 plugins (daily-summary, system-health, webhook-ping)
- [ ] `POST /api/plugins/:id/run` returns execution with status success/failed
- [ ] `POST /api/schedules` creates a schedule
- [ ] `PATCH /api/schedules/:id/toggle` toggles enabled
- [ ] `docker compose down && docker compose up -d` — all 3 seed plugins still present, all schedules re-registered
- [ ] `GET /api/n8n/workflows` returns 503 (N8N_API_KEY not set)

---

## Frontend Tests

Run from `frontend/` directory.

```bash
cd frontend
npm install
```

### Run all component + utility tests
```bash
npm test
```
Expected: 6 test suites, ~30 tests, all passing.

### Run with coverage
```bash
npm run test:coverage
```
Expected: Coverage report in `frontend/coverage/`.

### TypeScript build check
```bash
npm run build
```
Expected: exits 0 with no TypeScript errors.

---

## Full Integration Smoke Test (run after `docker compose up --build`)

Run these checks after the full stack is up.

```bash
# 1. Login page loads
curl -s -o /dev/null -w "%{http_code}" http://localhost
# Expected: 200

# 2. Dashboard (requires token)
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"changeme"}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# Expected: JSON with stats.totalPlugins == 3

# 3. Seed plugins present
curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep '"name"'
# Expected: "Daily Summary", "System Health", "Webhook Ping"

# 4. Run daily-summary plugin
PLUGIN_ID=$(curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])")
curl -s -X POST "http://localhost/api/plugins/$PLUGIN_ID/run" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# Expected: {"status":"success","output":"...[=== ... ===]..."}

# 5. Create and verify schedule
curl -s -X POST http://localhost/api/schedules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"pluginId\":\"$PLUGIN_ID\",\"name\":\"Smoke test\",\"cron\":\"0 9 * * *\"}" | python3 -m json.tool
# Expected: {"id":"...","cron":"0 9 * * *","enabled":true}

# 6. n8n bridge returns 503 (API key not set)
curl -s http://localhost/api/n8n/workflows \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"statusCode":503,"message":"N8N_API_KEY not configured"}

# 7. Verify state persists after restart
docker compose down
docker compose up -d
sleep 10
curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'plugins')"
# Expected: 3 plugins
```

### Manual UI Checklist

After running `docker compose up --build`, verify in browser:

- [ ] `http://localhost` redirects to `/login`
- [ ] Login with ADMIN_PASSWORD from .env → redirected to dashboard
- [ ] Dashboard shows 4 stat cards with values
- [ ] Plugins page shows 3 plugin cards (📋 Daily Summary, 🖥️ System Health, 🔔 Webhook Ping)
- [ ] Click "Run now" on Daily Summary → toast appears, card shows last run time
- [ ] Click "Configure" on Webhook Ping → modal opens with URL and Label fields
- [ ] Click "Schedule" on any plugin → modal opens with presets and cron preview
- [ ] Schedules page → table loads, toggle works, delete shows confirmation
- [ ] Calendar page → current month displays, dots appear on days with schedules
- [ ] n8n Workflows page → shows setup instructions (N8N_API_KEY not set)
- [ ] Settings page → shows Node version, plugin dir, Telegram/n8n status badges
- [ ] `/n8n` → n8n UI loads in browser
- [ ] Logout → clears token, redirects to `/login`, protected routes redirect back to login
- [ ] No console errors on any page
