# Mails App — Design Spec

**Date:** 2026-06-28  
**Status:** Approved

---

## Overview

A bulk outreach email app integrated into auto-hub as a fully isolated Docker container. Supports multiple Gmail send-as aliases from a single Gmail account, Excel-based contact import with column mapping, merge-tag personalization, immediate and scheduled sending via Gmail SMTP, and open/reply tracking.

---

## Architecture

```
Browser
  └─► Nginx
        ├─► /mails-api/  → mails container (NestJS, port 3001)
        └─► /            → frontend (Next.js) — /mails route added

mails container:
  ├── NestJS API
  ├── SQLite (volume: mails_data)
  ├── Nodemailer (smtp.gmail.com:587 TLS)
  ├── IMAP poller (imap.gmail.com:993, every 15 min)
  └── Open-pixel endpoint (/mails-api/track/open/:logId.gif)
```

### New Docker Compose additions

- `mails` service — builds from `./mails`, receives `JWT_SECRET` and `DOMAIN` env vars
- `mails_data` volume — SQLite file persisted here
- Nginx: new `location /mails-api/ { proxy_pass http://mails:3001/; }` block

### Auth

The mails service validates the existing auto-hub JWT (shared `JWT_SECRET`) from the `Authorization: Bearer` header. No separate login. Users are already authenticated via auto-hub's login flow.

### App registration

Added to `frontend/src/app/(app)/apps/apps.config.ts` with `lucideIcon: 'Mail'`, `color: '#8b5cf6'`, `url: '/mails'`.

---

## Gmail Authentication

**Method: App Password (Gmail App Password + SMTP)**

- Users generate a 16-char App Password in their Google Account security settings
- Stored once per alias in the mails app's settings page
- Stored AES-256 encrypted at rest in SQLite
- Used for both SMTP sending (`smtp.gmail.com:587` TLS) and IMAP polling (`imap.gmail.com:993` SSL)
- No Google Cloud Console / OAuth setup required

---

## Database Schema (SQLite)

### `gmail_accounts`
| column | type | notes |
|---|---|---|
| id | integer PK | |
| email | text | e.g. `sales@serenedge.com` |
| displayName | text | e.g. `Sales SerenEdge` |
| appPassword | text | AES-256 encrypted |
| isDefault | boolean | pre-selected in campaign wizard |
| createdAt | datetime | |

### `campaigns`
| column | type | notes |
|---|---|---|
| id | integer PK | |
| name | text | e.g. "June SaaS Outreach" |
| fromAccountId | FK → gmail_accounts | |
| subject | text | supports `{{merge}}` tags |
| bodyHtml | text | HTML body with `{{merge}}` tags |
| status | enum | `draft / scheduled / sending / paused / completed` |
| scheduledAt | datetime | null = send immediately on launch |
| ratePerHour | integer | null = no cap (1.5s delay between sends) |
| createdAt | datetime | |
| updatedAt | datetime | |

### `contacts`
| column | type | notes |
|---|---|---|
| id | integer PK | |
| campaignId | FK → campaigns | |
| firstName | text | |
| lastName | text | |
| email | text | |
| company | text | |

### `send_logs`
| column | type | notes |
|---|---|---|
| id | integer PK | |
| campaignId | FK → campaigns | |
| contactId | FK → contacts | |
| status | enum | `pending / sent / failed` |
| messageId | text | Gmail Message-ID header, used for IMAP reply matching |
| sentAt | datetime | |
| openedAt | datetime | null until tracking pixel fires |
| repliedAt | datetime | null until IMAP poller finds a reply |
| error | text | SMTP error message on failure |

---

## Backend Modules (NestJS)

### `AccountsModule`
- CRUD for `gmail_accounts`
- AES-256 encrypt/decrypt of `appPassword` using `JWT_SECRET` as key material
- Endpoint: `GET/POST/PATCH/DELETE /mails-api/accounts`

### `CampaignsModule`
- CRUD for campaigns
- `POST /mails-api/campaigns/:id/launch` — triggers send queue
- `POST /mails-api/campaigns/:id/pause` / `/resume`
- `POST /mails-api/campaigns/:id/retry-failed` — re-queues failed logs

### `ContactsModule`
- `POST /mails-api/campaigns/:id/contacts` — accepts parsed contact array from frontend
- Column mapping is done client-side; backend receives already-mapped objects

### `MailQueueService`
- Processes `send_logs` with status `pending`
- Immediate mode: 1.5s delay between sends
- Scheduled mode: `node-cron` fires at `scheduledAt`, then paces sends at `ratePerHour`
- Per send: replaces `{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{company}}` in subject and body, appends tracking pixel, sends via Nodemailer, updates log

### `TrackingModule`
- `GET /mails-api/track/open/:logId.gif` — marks `openedAt`, returns 1×1 transparent GIF
- Background `ImapPollerService`: connects per alias to `imap.gmail.com:993`, runs every 15 min, searches for `In-Reply-To` matching any `messageId` in `send_logs`, marks `repliedAt`

### `TemplateModule`
- `GET /mails-api/template/contacts.xlsx` — returns the bundled Excel template file

---

## Frontend Pages (Next.js, under `/mails`)

### `/mails` — Campaign Dashboard
- Table: name, from-alias, sent/opened/replied counts, status badge, date
- "New Campaign" CTA
- Download Excel template button

### `/mails/settings` — Gmail Account Setup
- List configured aliases (display name + email)
- Add alias form: display name, email, App Password (masked)
- Set default, delete alias

### `/mails/campaigns/new` — New Campaign Wizard

**Step 1 — Name & Sender**
- Campaign name input
- From-alias selector (dropdown of configured accounts, default pre-selected)

**Step 2 — Upload Contacts**
- Drag-and-drop `.xlsx` upload
- SheetJS (`xlsx` npm) parses in-browser — no file sent to server until mapping confirmed
- Auto-detect column headers
- Mapping UI: for each detected column, a dropdown → `firstName / lastName / email / company / ignore`
- Preview table: first 5 rows with mapped values
- Confirm → contacts held in local state until campaign is saved

**Step 3 — Compose**
- Subject line input (supports `{{merge}}` tags)
- Rich-text HTML body editor (TipTap)
- Merge tag helper panel: buttons to insert `{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{company}}` at cursor

**Step 4 — Send Options**
- Toggle: Immediate / Scheduled
- Scheduled: date + time picker
- Rate cap: slider 10–500 emails/hour (or "no cap")
- Preview: "Sending to X contacts. Estimated completion: Y" 
- Warning banner if contact count > 500 (Gmail free daily limit)

**Step 5 — Review & Launch**
- Summary of all choices
- "Launch Campaign" button → creates campaign + uploads contacts + triggers send

### `/mails/campaigns/[id]` — Campaign Detail
- Header stats: total / sent / failed / opened / replied
- Per-recipient table: name, email, company, status icon, sent time, open indicator, reply indicator, error message
- Pause / Resume button (for in-progress campaigns)
- Re-send Failed button (re-queues only failed log entries)

---

## Sending Flow

1. Launch → all contacts inserted into `send_logs` with `status = pending`
2. `MailQueueService` picks up pending logs
3. For each log:
   - Merge tags replaced in subject + bodyHtml
   - Tracking pixel `<img src="https://{DOMAIN}/mails-api/track/open/{logId}.gif" ...>` appended to body
   - Nodemailer sends via `smtp.gmail.com:587` TLS with alias's App Password
   - On success: `status = sent`, `sentAt = now`, `messageId = <Gmail Message-ID>`
   - On failure: `status = failed`, `error = SMTP error`
4. Pacing: 1.5s between sends (no-cap mode), or `3600 / ratePerHour` seconds between sends (rate-capped mode)
5. Scheduled campaigns: `node-cron` job fires at `scheduledAt`, then enters same queue loop

---

## Open Tracking

- 1×1 transparent GIF served at `/mails-api/track/open/:logId.gif`
- On request: `send_logs.openedAt` set to `now`
- Limitation: Gmail, Apple Mail on-device, and privacy-focused clients block remote images. Tracked opens are a best-effort signal, noted in the UI.

---

## Reply Detection (IMAP Poller)

- `ImapPollerService` runs every 15 minutes per configured alias
- Connects to `imap.gmail.com:993` with SSL using App Password
- Searches INBOX for emails with `In-Reply-To` matching any `messageId` in `send_logs`
- On match: sets `send_logs.repliedAt = now`
- Uses `imapflow` npm package (modern, Promise-based IMAP client)

---

## Excel Template

Bundled file `contacts_template.xlsx` served at `GET /mails-api/template/contacts.xlsx`.

Columns: `firstName`, `lastName`, `email`, `company`

Users can add extra columns — they will appear in the mapping UI and can be ignored or mapped.

---

## Rate Limit Warnings

| Account type | Daily limit |
|---|---|
| Gmail free | ~500 emails/day |
| Google Workspace | ~2,000 emails/day |

The wizard Step 4 shows a warning if the contact list exceeds 500. No hard enforcement — user's responsibility to stay within Google's limits.

---

## Nginx Change

```nginx
location /mails-api/ {
    proxy_pass http://mails:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## Tech Stack (mails container)

| Concern | Library |
|---|---|
| Framework | NestJS 10 |
| Database | SQLite via `better-sqlite3` + TypeORM |
| ORM migrations | TypeORM migrations |
| SMTP | Nodemailer |
| IMAP | imapflow |
| Scheduling | node-cron |
| Encryption | Node.js built-in `crypto` (AES-256-GCM) |
| Excel template | Generated with `exceljs` at build time |

---

## Frontend Tech Stack (additions to existing Next.js)

| Concern | Library |
|---|---|
| Excel parsing | `xlsx` (SheetJS) — client-side |
| Rich text editor | TipTap |
| New route | `frontend/src/app/(app)/mails/` |
