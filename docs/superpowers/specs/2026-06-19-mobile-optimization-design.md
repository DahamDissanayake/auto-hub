# Mobile Optimization Design
**Date:** 2026-06-19  
**Status:** Approved

## Problem

The frontend has three mobile-broken areas:

1. **Navigation** — `Sidebar` is `w-56 h-screen sticky`, rendered unconditionally. On mobile it consumes ~224px of a ~390px viewport, leaving ~166px for content. The app is effectively unusable on phones.
2. **Schedules table** — 7-column `<table>` with `overflow-x-auto`. Scrolls horizontally but is hostile on touch.
3. **Calendar popovers** — triggered by `onMouseEnter`/`onMouseLeave`. Hover events do not fire on touch screens, so the schedule/workflow popover is completely inaccessible on mobile.

Everything else (login, dashboard stat cards, plugins grid, n8n workflows grid) already has correct responsive classes and needs no changes.

## Scope

Three targeted fixes. No new pages, no API changes, no design system changes.

---

## 1. Navigation — Bottom Tab Bar on Mobile

### Behaviour

| Breakpoint | Navigation |
|------------|-----------|
| `< md` (< 768px) | Sidebar hidden. Fixed bottom tab bar visible. |
| `≥ md` (≥ 768px) | Sidebar visible. Bottom tab bar hidden. |

### Bottom tab bar spec

- Fixed to bottom of viewport (`fixed bottom-0 left-0 right-0 z-50`)
- Background: `bg-[#111111]`, top border: `border-t border-[#2a2a2a]`
- 5 nav items: Dashboard, Plugins, Schedules, Calendar, n8n Workflows
- Each item: icon (20px) + label below (10px), stacked vertically, equal flex width
- Active state: icon and label in `text-[#3b82f6]`; inactive: `text-[#6b7280]`
- Settings and Logout are not in the bottom bar — they remain only in the sidebar. On mobile, Settings is accessible via its own nav URL (`/settings`) if needed; Logout is a lower-priority action acceptable to leave desktop-only for now.
- Main content padding: `pb-20 md:pb-0` on the `<main>` element in `AppShell` so content is never hidden behind the tab bar.

### Files changed

- `frontend/src/components/layout/AppShell.tsx` — add `<BottomNav />`, add `pb-20 md:pb-0` to `<main>`, hide sidebar with `hidden md:flex` on the `<aside>` wrapper.
- `frontend/src/components/layout/BottomNav.tsx` — new component (the 5-item tab bar).
- `frontend/src/components/layout/Sidebar.tsx` — add `hidden md:flex` to the outermost `<aside>` element.

---

## 2. Schedules — Cards on Mobile, Table on Desktop

### Behaviour

| Breakpoint | Layout |
|------------|--------|
| `< sm` (< 640px) | Card list |
| `≥ sm` (≥ 640px) | Existing table (unchanged) |

### Card layout spec

Each schedule card (`bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4`):

- **Row 1:** Schedule name (`text-[#f1f1f1] text-sm font-medium`) + enabled/disabled toggle button (right-aligned, same style as table)
- **Row 2:** Plugin name with icon (`text-[#9ca3af] text-xs`) + cron string in mono (`text-[#6b7280] text-xs font-mono`)
- **Row 3:** Last run time (`text-[#6b7280] text-xs`) + delete icon button (right-aligned, same hover-red style as table)

### Files changed

- `frontend/src/app/(app)/schedules/page.tsx` — wrap existing table in `<div className="hidden sm:block">`, add card list in `<div className="sm:hidden space-y-3">` using same state, handlers, and data already present on the page.

---

## 3. Calendar — Tap to Toggle Popover

### Behaviour

- `onMouseEnter`/`onMouseLeave` removed.
- State changes from `hoveredDay: Date | null` to `selectedDay: Date | null`.
- Clicking a day cell: if `selectedDay` is that day → set to `null` (dismiss). Otherwise → set to that day (open).
- Clicking outside any day cell dismisses the popover via a `useEffect` that adds a `mousedown` listener on `document`. The listener checks if the click target is outside the `.calendar-day` elements and resets `selectedDay`.
- The popover component (`DayPopover`) is unchanged.

### Why click over hover

Click is more intentional than hover on desktop too. The popover stays visible while the user reads it, rather than disappearing when they move to interact with popover content. This is a UX improvement on all devices.

### Files changed

- `frontend/src/app/(app)/calendar/page.tsx` — rename state, replace event handlers, add outside-click `useEffect`, add `calendar-day` className to each day cell.

---

## Out of Scope

- Settings page on mobile (no hamburger/header needed; settings is reachable via sidebar on desktop and `/settings` URL directly)
- Logout on mobile (acceptable desktop-only action for now)
- PluginCard, ConfigModal, ScheduleModal responsive improvements (already adequate)
- Any backend or nginx changes
