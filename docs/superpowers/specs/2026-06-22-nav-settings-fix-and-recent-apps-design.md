# Nav: Settings Fix + Recent Apps in Sidebar & Mobile Menu

**Date:** 2026-06-22
**Status:** Approved

---

## Problem

1. **Settings misplaced in mobile menu** — `MobileNav.tsx` includes Settings in the main `navItems` array, so it renders in the scrollable nav list alongside Dashboard, Shortcuts, Apps, Calendar, and n8n Workflows. It must sit in the bottom section next to Logout (matching `Sidebar.tsx` which already does this correctly).

2. **No recently used apps in nav panels** — Both the desktop Sidebar and mobile MobileNav show only the "Apps" link with no quick-access to individual apps. Users want the 5 most recently opened apps listed under that link, most recent first.

---

## Fix 1: Settings Placement in MobileNav

Remove `Settings` from the `navItems` array in `MobileNav.tsx` and add it explicitly in the bottom footer `<div>` above Logout — identical structure to `Sidebar.tsx`.

**Files changed:** `frontend/src/components/layout/MobileNav.tsx` only.

---

## Fix 2: Recently Used Apps

### Data Layer — `useRecentApps` hook

**File:** `frontend/src/lib/hooks/useRecentApps.ts`

- `localStorage` key: `autohub_recent_apps`
- Stored format: `Array<{ id: string; lastUsed: number }>`, max 5 entries, sorted newest first
- `recordAppVisit(id: string)` — pure function (no React); removes any existing entry for `id`, prepends `{ id, lastUsed: Date.now() }`, trims to 5, writes back to localStorage
- `useRecentApps(): AppEntry[]` — React hook; reads and parses localStorage on mount; maps ids to `AppEntry` objects from `apps.config.ts`; filters out any ids that no longer exist in the config; returns resolved array newest-first

### Recording — `AppVisitRecorder`

**File:** `frontend/src/app/(app)/apps/[id]/page.tsx` (added as an inline `'use client'` component)

- Client component receiving `id: string` prop
- Calls `recordAppVisit(id)` inside `useEffect([id])` on mount
- Returns `null` — no rendered output
- Placed at the top of the server component's JSX output so it fires on every visit to `/apps/[id]`

### Display — Sidebar & MobileNav

Both components call `useRecentApps()` and conditionally render a sub-list directly below the "Apps" `<NavLink>`:

- Only rendered when `recentApps.length > 0`
- Each item: small colored dot (using `app.color`) + `app.name`, links to `/apps/${app.id}`
- Style: `pl-7` indent, `text-xs`, same muted/hover colour tokens as existing nav items (`text-[#6b7280]`, `hover:text-[#f1f1f1]`, `hover:bg-[#1a1a1a]`)
- Active state: if `pathname === /apps/${app.id}`, highlight in blue matching existing active style

**Files changed:**
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/MobileNav.tsx`
- `frontend/src/lib/hooks/useRecentApps.ts` (new)
- `frontend/src/app/(app)/apps/[id]/page.tsx`

---

## Data Flow

```
User visits /apps/[id]
  → AppVisitRecorder mounts
  → recordAppVisit(id) writes to localStorage
  → Next time Sidebar/MobileNav renders (route change)
  → useRecentApps() reads localStorage → resolved AppEntry[]
  → Sub-list renders below "Apps" link
```

---

## Constraints & Non-Goals

- No backend involvement — localStorage only
- Max 5 entries enforced at write time
- If localStorage is unavailable (SSR, private mode), `useRecentApps` returns `[]` silently
- No deduplication needed beyond the existing "remove before prepend" logic
- BottomNav (the fixed bottom tab bar) is not changed — it does not have an Apps sub-list
