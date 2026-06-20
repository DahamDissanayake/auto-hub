# Timezone Settings Design

**Date:** 2026-06-20
**Status:** Approved

---

## Overview

Replace the hardcoded `TIMEZONE` environment variable with a UI-configurable timezone setting stored in the database. The setting is exposed via `GET /api/settings`, editable from the Settings page, and applied to all absolute date/time formatting in the frontend. Default: `Asia/Colombo` (UTC+5:30).

---

## Architecture

```
Settings page (frontend)
  → GET /api/settings        → reads AppSettings table → { timezone: 'Asia/Colombo', ... }
  → PATCH /api/settings      → writes AppSettings table

GET /api/health              → expanded to return full HealthData
                               (version, nodeVersion, timezone from settings,
                                pluginDir, telegramConfigured, n8nConfigured)

date formatting (frontend)
  → useSettings() hook supplies timezone string
  → formatInTimeZone(date, timezone, pattern) from date-fns-tz
```

---

## Database

### New entity: `AppSettings`

```typescript
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

Seeded on backend startup (if key not yet present):

| key        | value            |
|------------|------------------|
| `timezone` | `Asia/Colombo`   |

---

## Backend

### New module: `SettingsModule`

**`SettingsService`**:
- `getAll(): Promise<Record<string, string>>` — returns all settings as a plain object
- `get(key: string): Promise<string | null>`
- `set(key: string, value: string): Promise<void>` — upsert
- Seeds defaults on `onModuleInit` (insert if not exists)

**`SettingsController`** (`/api/settings`):
- `GET /api/settings` — returns `{ timezone: 'Asia/Colombo' }` (all settings)
- `PATCH /api/settings` — body `{ timezone?: string, ... }`, updates each provided key

**Validation** for timezone value: must be a non-empty string matching an IANA timezone identifier. Validated using `Intl.supportedValuesOf('timeZone').includes(value)` (Node 18+). Returns 400 if invalid.

### Updated `HealthController`

Expands from `{ status: 'ok' }` to the full `HealthData` shape the frontend already expects:

```typescript
return {
  status: 'ok',
  version: process.env.npm_package_version ?? '1.0.0',
  nodeVersion: process.version,
  timezone: await this.settingsService.get('timezone') ?? 'Asia/Colombo',
  pluginDir: this.config.get('PLUGIN_DIR') ?? '/app/plugins',
  telegramConfigured: !!(this.config.get('TELEGRAM_BOT_TOKEN') && this.config.get('TELEGRAM_CHAT_ID')),
  n8nConfigured: !!this.config.get('N8N_API_KEY'),
};
```

`HealthController` injects `SettingsService` and `ConfigService`.

---

## Frontend

### New dependency: `date-fns-tz`

```bash
npm install date-fns-tz
```

Provides `formatInTimeZone(date, tz, pattern)` for timezone-aware formatting.

### New hook: `useSettings()`

```typescript
// src/lib/hooks/useSettings.ts
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ timezone: string }>('/api/settings').then(r => r.data),
    staleTime: 60_000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: { timezone?: string }) =>
      api.patch('/api/settings', patch).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}
```

### `TimezoneContext`

A React context that provides the active timezone string to the whole app:

```typescript
// src/lib/context/TimezoneContext.tsx
export const TimezoneContext = createContext('Asia/Colombo')

export function TimezoneProvider({ children }) {
  const { data: settings } = useSettings()
  const tz = settings?.timezone ?? 'Asia/Colombo'
  return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>
}

export const useTimezone = () => useContext(TimezoneContext)
```

`TimezoneProvider` wraps the app inside `Providers` (alongside the existing QueryClientProvider).

### Updated date formatting

Replace bare `format(date, pattern)` calls with `formatInTimeZone(date, tz, pattern)` in:

- `src/components/plugins/ExecutionLog.tsx` — execution timestamp
- `src/app/(app)/calendar/page.tsx` — schedule next/last run times

`formatDistanceToNow` calls are **not** changed (relative time is timezone-independent).

### Updated Settings page (`src/app/(app)/settings/page.tsx`)

Replace the static "Timezone" `<Row>` with an interactive section:

```
┌─ Display ──────────────────────────────────────┐
│ Timezone                                        │
│ [  Asia/Colombo (UTC+5:30)          ▼ ]  Save  │
└────────────────────────────────────────────────┘
```

- A `<select>` pre-populated with a curated list of ~30 common IANA timezones (not all 500+), with `Asia/Colombo` first
- "Save" button calls `PATCH /api/settings` with the selected value
- Shows a success toast on save; shows error toast on failure
- The existing "System Info" section's Timezone row now reads from `useHealth()` (which reflects the saved value from the DB) — no change needed there since `health.timezone` will now return the DB value

---

## Timezone Selector Options (curated list)

The dropdown includes:

```
Asia/Colombo       UTC+5:30 — Sri Lanka (default)
Asia/Kolkata       UTC+5:30 — India
Asia/Dubai         UTC+4
Asia/Bangkok       UTC+7
Asia/Singapore     UTC+8
Asia/Tokyo         UTC+9
Europe/London      UTC+0/+1
Europe/Paris       UTC+1/+2
Europe/Berlin      UTC+1/+2
America/New_York   UTC-5/-4
America/Chicago    UTC-6/-5
America/Denver     UTC-7/-6
America/Los_Angeles UTC-8/-7
America/Sao_Paulo  UTC-3
UTC                UTC+0
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Invalid IANA timezone submitted | 400 from backend; frontend shows error toast |
| Settings table empty on first boot | `SettingsService.onModuleInit` seeds defaults |
| `date-fns-tz` receives unknown timezone | Falls back to UTC (date-fns-tz behaviour) |
| Health endpoint fails | Existing `isLoading`/`—` fallback in Settings page |

---

## Out of Scope

- Per-user timezone (single-user dashboard, one global setting)
- Changing the Docker container OS timezone (requires restart; env var approach)
- Timezone-aware cron scheduling (cron patterns still fire at UTC server time)
- More than ~30 timezone options in the dropdown
