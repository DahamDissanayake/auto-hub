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

*Frontend tests will be added in Plan 2.*
