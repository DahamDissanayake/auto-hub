# Login Management Design

**Date:** 2026-06-22
**Status:** Approved

---

## Overview

Replace the current stateless single-JWT auth with a device-aware session system that supports:
- Permanent trusted devices (password only, 7-day rolling sessions)
- Non-permanent devices (password + Telegram OTP, session-only persistence)
- Server-side sessions enabling per-device and full revocation
- Login history and session management in the Settings page

This is a single-admin system. All devices belong to the same admin. No username concept is introduced.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND                                                     │
│                                                              │
│  localStorage:   deviceToken (UUID, permanent identity)      │
│  localStorage:   sessionToken (7-day, permanent devices)     │
│  sessionStorage: sessionToken (tab-only, non-permanent)      │
│  memory only:    accessJwt   (15min, refreshed silently)     │
└─────────────────────────┬────────────────────────────────────┘
                          │ REST
┌─────────────────────────▼────────────────────────────────────┐
│  BACKEND (NestJS) — auth module extended                      │
│                                                              │
│  POST /api/auth/login          — password check, OTP trigger │
│  POST /api/auth/otp/verify     — OTP validation              │
│  POST /api/auth/refresh        — silent access JWT renewal   │
│  POST /api/auth/logout         — revoke current session      │
│  POST /api/auth/logout-all     — revoke all sessions         │
│  GET  /api/auth/sessions       — devices + login history     │
│  PATCH /api/auth/devices/:id   — mark device permanent/not   │
│  DELETE /api/auth/sessions/:id — revoke one session          │
└───────────┬───────────────────────┬──────────────────────────┘
            │                       │
  ┌─────────▼──────┐     ┌──────────▼──────┐
  │  PostgreSQL     │     │  Redis           │
  │  devices        │     │  session:{token} │
  │  login_events   │     │  otp:{ip}        │
  └─────────────────┘     └──────────────────┘
```

**Terminal and Files services are unchanged.** They continue to verify 15-min signed JWTs using `JWT_SECRET`. The only change from their perspective is that the access JWT lifetime shortens from 7 days to 15 minutes.

---

## Data Model

### PostgreSQL Entities

```typescript
// Device — identifies a browser/device across sessions
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ unique: true }) token: string       // UUID stored in localStorage
  @Column({ nullable: true }) name: string      // user-assigned label
  @Column({ nullable: true }) userAgent: string
  @Column({ nullable: true }) browser: string   // "Chrome 124"
  @Column({ nullable: true }) os: string        // "macOS 14"
  @Column({ nullable: true }) ip: string        // IP at first registration
  @Column({ default: false }) isPermanent: boolean
  @CreateDateColumn() firstSeen: Date
  @UpdateDateColumn() lastSeen: Date
}

// LoginEvent — audit log of every auth action
@Entity('login_events')
export class LoginEvent {
  @PrimaryGeneratedColumn('uuid') id: string
  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  device: Device | null
  @Column({ nullable: true }) deviceId: string
  @Column() ip: string
  @Column({ nullable: true }) browser: string
  @Column({ nullable: true }) os: string
  @Column() eventType: LoginEventType   // see enum below
  @CreateDateColumn() createdAt: Date
}

enum LoginEventType {
  PASSWORD_OK    = 'password_ok',
  PASSWORD_FAIL  = 'password_fail',
  OTP_SENT       = 'otp_sent',
  OTP_OK         = 'otp_ok',
  OTP_FAIL       = 'otp_fail',
  OTP_LOCKED     = 'otp_locked',
  SESSION_ISSUED = 'session_issued',
  LOGOUT         = 'logout',
  REVOKED        = 'revoked',
}
```

### Redis Key Schema

```
autohub:session:{sessionToken}
  Value: JSON { deviceId: string, issuedAt: ISO, expiresAt: ISO | null }
  TTL:   7 days for permanent devices; no TTL for non-permanent
         (non-permanent sessions exist in Redis until the tab closes and
          the frontend sends POST /auth/logout on beforeunload, or until
          the next login from that device cleans up stale keys)

autohub:otp:{ip}
  Value: JSON { code: string, attempts: number, lockedUntil?: ISO }
  TTL:   5 minutes (auto-expires; lock state is re-stored with 5min TTL on lockout)
```

### TypeORM Migration

Two new migration files generated via `typeorm migration:generate`. Added to `AppModule` entities array: `Device`, `LoginEvent`. `synchronize` stays `false`.

---

## Auth Flows

### Flow 1 — Unknown or non-permanent device

```
POST /auth/login { password, deviceToken? }

1. Validate password (existing bcrypt/timingSafeEqual logic, unchanged)
   → fail: log PASSWORD_FAIL, return 401

2. Parse UA header → extract browser + OS strings

3. If deviceToken present:
     look up Device in DB
     if found and isPermanent → go to Flow 2
     if found and not permanent → continue to OTP
   If deviceToken absent:
     create Device record, generate new deviceToken (crypto.randomUUID())

4. Generate 6-digit OTP (crypto.randomInt(100000, 999999).toString())
   Check Redis otp:{ip} → if lockedUntil > now → return 429 { reason: 'otp_locked', lockedUntil }
   Store Redis: autohub:otp:{ip} = { code, attempts: 0 } TTL 5min
   Log OTP_SENT

5. Send Telegram via NotificationsService:
   "🔐 AutoHub login code: 123456
   Browser: Chrome · macOS
   IP: 1.2.3.4
   Expires in 5 minutes."

6. Return 200 { step: 'otp_required', deviceToken }
   (no session issued yet)

POST /auth/otp/verify { otp, deviceToken }

7. Look up Redis otp:{ip}
   → missing: return 401 { reason: 'otp_expired' }
   → lockedUntil > now: return 429 { reason: 'otp_locked', lockedUntil }
   → code mismatch:
       attempts++
       if attempts >= 3:
         set lockedUntil = now+5min, re-store with TTL 5min
         log OTP_LOCKED, return 429 { reason: 'otp_locked', lockedUntil }
       else:
         update Redis, log OTP_FAIL
         return 401 { reason: 'otp_invalid', attemptsRemaining: 3 - attempts }
   → match:
       delete Redis key, log OTP_OK

8. Issue session:
   sessionToken = crypto.randomUUID()
   Store Redis: autohub:session:{sessionToken} = { deviceId, issuedAt, expiresAt: null }
   No TTL (non-permanent; client clears on tab close via logout)
   Update device.lastSeen
   Log SESSION_ISSUED

9. Sign accessJwt: { sub: 'admin' } expiresIn: '15m'

10. Return { sessionToken, accessJwt, deviceToken, isPermanent: false }
```

### Flow 2 — Permanent device

```
POST /auth/login { password, deviceToken }
  (password already validated in step 1 above)

1. Device found + isPermanent = true → skip OTP

2. Issue session:
   sessionToken = crypto.randomUUID()
   expiresAt = now + 7 days
   Store Redis: autohub:session:{sessionToken} = { deviceId, issuedAt, expiresAt }
   TTL: 7 days
   Update device.lastSeen
   Log SESSION_ISSUED

3. Sign accessJwt: { sub: 'admin' } expiresIn: '15m'

4. Return { sessionToken, accessJwt, deviceToken, isPermanent: true }
```

### Silent Refresh

```
POST /auth/refresh  Body: { sessionToken: string }

→ look up Redis autohub:session:{sessionToken}
→ missing or expired: return 401
→ found: issue new accessJwt (15min), return { accessJwt }
```

The `api.ts` interceptor handles 401 responses by reading `sessionToken` from localStorage or sessionStorage, calling `POST /auth/refresh`, then retrying the original request with the new accessJwt. On refresh 401, clear all storage and redirect `/login`.

### Logout & Revocation

```
POST /auth/logout
  → DELETE autohub:session:{currentSessionToken}
  → log LOGOUT

POST /auth/logout-all
  → SCAN Redis for autohub:session:* → DEL all
  → log REVOKED for each
  → return 200 (frontend clears storage, redirects /login)

DELETE /auth/sessions/:deviceId
  → find session for device, DELETE from Redis
  → log REVOKED
  → if current session: frontend redirects /login

PATCH /auth/devices/:id { isPermanent: boolean }
  → update Device.isPermanent in DB
  → takes effect on next login (current session unaffected)
```

---

## Frontend Token Storage

```typescript
// On login response:
localStorage.setItem('autohub_device', deviceToken)   // always persisted

if (isPermanent) {
  localStorage.setItem('autohub_session', sessionToken)
} else {
  sessionStorage.setItem('autohub_session', sessionToken)
  // Register cleanup on tab close:
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon('/api/auth/logout', JSON.stringify({ sessionToken }))
  })
}
// accessJwt: stored in module-level variable only (memory)

// api.ts interceptors:
// Request: attach accessJwt as Authorization: Bearer
// Response 401: try POST /auth/refresh with sessionToken
//               on success: update in-memory accessJwt, retry original request
//               on failure: clear storage, redirect /login
```

---

## Settings UI — Sessions & Devices Section

Added as a new `<Section>` in `frontend/src/app/(app)/settings/page.tsx`, using the existing `Section` and `Row` components.

### Devices Card

Each known device shows:
- Coloured dot: green (has active session) or grey (no active session)
- "This device" badge when `deviceToken` in localStorage matches
- Browser · OS · IP · Last seen
- "Permanent" toggle (calls `PATCH /auth/devices/:id`)
- "Revoke" button (calls `DELETE /auth/sessions/:id`) — disabled if no active session

"Revoke All" button at section header level. Shows confirmation dialog before firing.

### Login History

Paginated list (20 per page, "Load more" appends). Each row:
```
Jun 22 14:32  ✓ Login         Chrome · macOS · 1.2.3.4
Jun 22 09:11  ✗ Wrong OTP     Chrome · macOS · 1.2.3.4
Jun 20 08:00  ✓ Login         Firefox · Windows · 5.6.7.8
Jun 18 23:45  ✗ Wrong password 9.10.11.12
```

Event icon mapping:
- `password_ok`, `otp_ok`, `session_issued` → `✓` green
- `password_fail`, `otp_fail` → `✗` red
- `otp_locked` → `⚠` amber
- `logout` → `↩` grey
- `revoked` → `🚫` red

Data fetched from `GET /api/auth/sessions?page=1&limit=20` which returns `{ devices, events, total }`. Devices always returned in full (at most one admin, finite devices). Events paginated server-side.

---

## OTP Screen (Frontend)

Two-step login page flow in `app/(auth)/login/page.tsx`:

```
Step 1: password input (current UI, unchanged visually)
  → on submit: POST /auth/login
  → if response.step === 'otp_required': show Step 2
  → if response.sessionToken: login complete (permanent device)

Step 2: OTP input
  Header: "Check Telegram for your code"
  Subtext: "Sent to your bot — expires in 5 minutes"
  6-digit input (numeric, auto-focus, auto-submit on 6th digit)
  30s countdown → "Resend code" button (re-POSTs /auth/login)
  Error states:
    otp_invalid + attemptsRemaining → "Incorrect. X attempts remaining."
    otp_locked → "Too many attempts. Try again at HH:MM."
    otp_expired → "Code expired." + back to Step 1 button
```

---

## Error Handling

| Scenario | Backend response | Frontend behaviour |
|---|---|---|
| Wrong password | 401 | "Invalid password" shown, no hint about device |
| OTP expired | 401 `otp_expired` | "Code expired — log in again", back to Step 1 |
| OTP wrong 1-2x | 401 `otp_invalid` | "Incorrect. X attempts remaining" |
| OTP locked | 429 `otp_locked` | "Try again at HH:MM" countdown |
| Session expired | 401 on refresh | Clear storage, redirect `/login` |
| Revoke all (self) | 200 | Clears storage, redirect `/login` |
| Redis down | 500 on refresh | Redirect `/login` (acceptable for personal tool) |
| deviceToken lost (localStorage cleared) | — | Treated as unknown device, gets OTP flow, old device record retained in DB |

---

## UA Parsing

Use the `ua-parser-js` npm package. Add to backend `package.json` — do not assume it is available as a transitive dependency. Extract:
- `browser.name` + `browser.major` → "Chrome 124"
- `os.name` + `os.version` → "macOS 14"

---

## Security Properties After This Change

| Property | Before | After |
|---|---|---|
| Token lifetime | 7-day JWT (stateless) | 15-min access JWT + server-side session |
| Revocation | Impossible without secret rotation | Per-session or nuclear, instant |
| Second factor | None | Telegram OTP for unknown devices |
| Token storage | sessionStorage only | Memory (access) + localStorage/sessionStorage (session) |
| Login audit | None | Full history in DB |
| OTP brute-force | N/A | 3 attempts → 5min lockout per IP |
| Device trust | None | Explicit permanent flag, user-controlled |
