# Nav Restructure: Apps Page + Schedules inside Calendar

**Date:** 2026-06-19

## Overview

Move Schedules out of the top-level nav and embed it as a tab inside the Calendar page (matching the Plugins/Output tab pattern). Replace the Schedules nav slot with a new Apps page — a simple card-based app launcher driven by a config file.

## 1. Calendar Page — Tab Strip

**File:** `frontend/src/app/(app)/calendar/page.tsx`

Add `type Tab = 'calendar' | 'schedules'`. Render a tab strip below the page header using the same pattern as `plugins/page.tsx`:

- Border-bottom tabs with blue active indicator
- "Calendar" tab (Calendar icon) — existing month grid, unchanged
- "Schedules" tab (Clock icon) — full schedules table lifted from `schedules/page.tsx`

All schedules logic moves into calendar/page.tsx:
- `useSchedules`, `useDeleteSchedule`, `useToggleSchedule` hooks
- `DeleteConfirmModal` component
- `ScheduleModal` usage
- Toggle and delete handlers

The `/schedules` route file (`src/app/(app)/schedules/page.tsx`) is deleted after migration.

## 2. Nav — Swap Schedules → Apps

**Files:** `frontend/src/components/layout/Sidebar.tsx`, `BottomNav.tsx`

- Remove: `{ href: '/schedules', label: 'Schedules', icon: Clock }`
- Add: `{ href: '/apps', label: 'Apps', icon: LayoutGrid }`

Update lucide-react imports accordingly (remove `Clock` if unused, add `LayoutGrid`).

## 3. Apps Page

**Files:**
- `frontend/src/app/(app)/apps/page.tsx` — page component
- `frontend/src/app/(app)/apps/apps.config.ts` — app definitions

### Config shape

```ts
export interface AppEntry {
  id: string
  name: string
  description: string
  url: string
  iconPath?: string   // relative to /public, e.g. "/img/icons/foo.png"
  color?: string      // hex or tailwind color for card accent, defaults to #3b82f6
}

export const apps: AppEntry[] = []
```

### Page behaviour

- Card grid (same 1/2/3-col responsive as Plugins)
- Each card: icon or colored initial, name, description, external link icon
- Click opens `url` in a new tab (`target="_blank" rel="noopener noreferrer"`)
- Empty state: "No apps configured yet — see `appcreator.md` to add one."
- No backend, no API calls

## 4. appcreator.md

**File:** `frontend/appcreator.md`

Documents:
- The `AppEntry` interface and every field
- How to add a new app (edit `apps.config.ts`, drop icon in `/public/img/icons/`)
- What counts as an "app" (any URL — internal Docker service, local tool, external site)
- Icon conventions (PNG/SVG, recommended 64×64px)

## Scope

- No backend changes
- No new API endpoints
- `/schedules` route deleted (not redirected — it was internal nav only)
- `Clock` import removed from nav files if no longer used
