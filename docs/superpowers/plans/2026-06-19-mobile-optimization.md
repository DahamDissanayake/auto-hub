# Mobile Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AutoHub frontend fully usable on mobile by adding a bottom tab bar, replacing the schedules table with cards on small screens, and converting the calendar popover from hover to tap.

**Architecture:** Three isolated changes — (1) navigation: new `BottomNav` component rendered inside `AppShell` with CSS breakpoints hiding the sidebar on mobile, (2) schedules: parallel card markup beside the existing table controlled by Tailwind `sm:hidden`/`hidden sm:block`, (3) calendar: state rename from `hoveredDay` to `selectedDay` with click handlers and an outside-click `useEffect`.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS v3, Vitest + @testing-library/react, Lucide React icons.

## Global Constraints

- Test command: `/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run` (run from `frontend/`)
- Node path: `/home/dama/.nvm/versions/node/v20.20.2/bin/node`
- No npm/npx — use the local binary at `node_modules/.bin/vitest`
- Tailwind breakpoints: `sm` = 640px, `md` = 768px
- Colours: bg `#0a0a0a`, surface `#1a1a1a`, border `#2a2a2a`, text-muted `#6b7280`, text-secondary `#9ca3af`, text-primary `#f1f1f1`, accent `#3b82f6`
- All files live under `frontend/src/`
- `'use client'` directive required on every component file touched

---

### Task 1: Fix stale Sidebar test + update Sidebar to hide on mobile

The existing `Sidebar.test.tsx` asserts `'⚡ AutoHub'` but the component now renders a Next.js `<Image>` and plain text `'AutoHub'`. Fix the stale assertion and add `hidden md:flex` to the sidebar's `<aside>` so it only shows on desktop.

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/Sidebar.test.tsx`

**Interfaces:**
- Produces: `Sidebar` renders with `className` containing `hidden md:flex` on its outermost element

- [ ] **Step 1: Update the stale test assertion**

Replace the single failing test in `Sidebar.test.tsx`. The component renders an `<img>` (Next.js Image renders as `<img>` in jsdom) and an `<AutoHub>` text span. Change:

```tsx
// frontend/src/components/layout/Sidebar.test.tsx
// Change this test:
it('renders AutoHub logo', () => {
  render(<Sidebar />)
  expect(screen.getByText('⚡ AutoHub')).toBeInTheDocument()
})
// To this:
it('renders AutoHub branding', () => {
  render(<Sidebar />)
  expect(screen.getByText('AutoHub')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to confirm it now passes**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run src/components/layout/Sidebar.test.tsx
```

Expected: `Tests  4 passed (4)` — all pass.

- [ ] **Step 3: Add `hidden md:flex` to Sidebar's `<aside>`**

In `frontend/src/components/layout/Sidebar.tsx`, change line 54:

```tsx
// Before:
<aside className="w-56 bg-[#111111] border-r border-[#2a2a2a] flex flex-col h-screen sticky top-0 shrink-0">

// After:
<aside className="hidden md:flex w-56 bg-[#111111] border-r border-[#2a2a2a] flex-col h-screen sticky top-0 shrink-0">
```

Note: `flex` is removed from the base classes and only activates at `md+` via `md:flex`. `flex-col` stays as a standalone modifier.

- [ ] **Step 4: Add a test that sidebar has the responsive class**

Add this test to `Sidebar.test.tsx` after the existing tests:

```tsx
it('has hidden md:flex classes for responsive visibility', () => {
  render(<Sidebar />)
  const aside = screen.getByRole('complementary')
  expect(aside.className).toContain('hidden')
  expect(aside.className).toContain('md:flex')
})
```

- [ ] **Step 5: Run tests to confirm all pass**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run src/components/layout/Sidebar.test.tsx
```

Expected: `Tests  5 passed (5)`

- [ ] **Step 6: Commit**

```bash
git -C /home/dama/repo/auto-hub add frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/Sidebar.test.tsx
git -C /home/dama/repo/auto-hub commit -m "feat: hide sidebar on mobile (md breakpoint)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create BottomNav component

New component rendered only on mobile (`flex md:hidden`) — 5 icon+label tabs, active state in accent blue.

**Files:**
- Create: `frontend/src/components/layout/BottomNav.tsx`
- Create: `frontend/src/components/layout/BottomNav.test.tsx`

**Interfaces:**
- Consumes: `usePathname` from `next/navigation`; nav item list identical to Sidebar (`/`, `/plugins`, `/schedules`, `/calendar`, `/n8n-workflows`)
- Produces: exported default `BottomNav` component, no props

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/layout/BottomNav.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

import BottomNav from './BottomNav'
import { usePathname } from 'next/navigation'

describe('BottomNav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
  })

  it('renders all 5 nav items', () => {
    render(<BottomNav />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Plugins')).toBeInTheDocument()
    expect(screen.getByText('Schedules')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('n8n')).toBeInTheDocument()
  })

  it('applies active colour to current path item', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<BottomNav />)
    const pluginsLink = screen.getByText('Plugins').closest('a')
    expect(pluginsLink?.className).toContain('text-[#3b82f6]')
  })

  it('applies inactive colour to non-current items', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<BottomNav />)
    const dashLink = screen.getByText('Dashboard').closest('a')
    expect(dashLink?.className).toContain('text-[#6b7280]')
  })

  it('has flex md:hidden for responsive visibility', () => {
    render(<BottomNav />)
    const nav = screen.getByRole('navigation')
    expect(nav.className).toContain('flex')
    expect(nav.className).toContain('md:hidden')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run src/components/layout/BottomNav.test.tsx
```

Expected: FAIL — `Cannot find module './BottomNav'`

- [ ] **Step 3: Create BottomNav.tsx**

Create `frontend/src/components/layout/BottomNav.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Puzzle, Clock, Calendar, GitBranch } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Plugins', icon: Puzzle },
  { href: '/schedules', label: 'Schedules', icon: Clock },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/n8n-workflows', label: 'n8n', icon: GitBranch },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#111111] border-t border-[#2a2a2a]">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center flex-1 py-2 gap-1 text-[10px] transition-colors ${
              isActive ? 'text-[#3b82f6]' : 'text-[#6b7280]'
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run src/components/layout/BottomNav.test.tsx
```

Expected: `Tests  4 passed (4)`

- [ ] **Step 5: Commit**

```bash
git -C /home/dama/repo/auto-hub add frontend/src/components/layout/BottomNav.tsx frontend/src/components/layout/BottomNav.test.tsx
git -C /home/dama/repo/auto-hub commit -m "feat: add BottomNav component for mobile navigation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Wire BottomNav into AppShell

Add `<BottomNav />` to `AppShell` and give `<main>` bottom padding so content isn't hidden behind the tab bar on mobile.

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `BottomNav` from `./BottomNav`
- Produces: `AppShell` renders both `<Sidebar>` (already hidden on mobile via Task 1) and `<BottomNav>` (hidden on desktop)

- [ ] **Step 1: Update AppShell.tsx**

Replace the full contents of `frontend/src/components/layout/AppShell.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const token = sessionStorage.getItem('autohub_token')
    if (!token) {
      router.replace('/login')
    }
  }, [router])

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 min-w-0 pb-20 md:pb-6">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run
```

Expected: All tests pass (the suite that was passing before still passes).

- [ ] **Step 3: Commit**

```bash
git -C /home/dama/repo/auto-hub add frontend/src/components/layout/AppShell.tsx
git -C /home/dama/repo/auto-hub commit -m "feat: wire BottomNav into AppShell with mobile bottom padding

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Schedules page — card layout on mobile

Wrap the existing table in `hidden sm:block`. Add a card list above it in `sm:hidden` using the exact same data, handlers, and state already on the page.

**Files:**
- Modify: `frontend/src/app/(app)/schedules/page.tsx`

**Interfaces:**
- Consumes: same `schedules`, `pluginMap`, `handleToggle`, `setDeleteTarget` already in scope
- Produces: no new exports — self-contained page change

- [ ] **Step 1: Update schedules/page.tsx**

In `frontend/src/app/(app)/schedules/page.tsx`, replace the block that starts at the `{!schedules || schedules.length === 0 ? (` conditional (lines 114–184). Replace with the following — the empty-state is unchanged, but the populated state now has both a card list and the table:

```tsx
      {!schedules || schedules.length === 0 ? (
        <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
          No schedules yet. Go to{' '}
          <a href="/plugins" className="text-[#3b82f6] hover:underline">
            Plugins
          </a>{' '}
          and schedule one.
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {schedules.map(schedule => {
              const plugin = pluginMap.get(schedule.pluginId)
              return (
                <div
                  key={schedule.id}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[#f1f1f1] text-sm font-medium truncate">{schedule.name}</p>
                    <button
                      onClick={() => handleToggle(schedule.id)}
                      className={`text-xs px-2 py-1 rounded border shrink-0 transition-colors ${
                        schedule.enabled
                          ? 'border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10'
                          : 'border-[#2a2a2a] text-[#6b7280] hover:border-[#3b82f6]'
                      }`}
                    >
                      {schedule.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                    {plugin && <span>{plugin.icon}</span>}
                    <span>{plugin?.name ?? schedule.pluginId.slice(0, 8) + '…'}</span>
                    <span className="font-mono text-[#6b7280]">{schedule.cron}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#6b7280]">
                    <span>
                      {schedule.lastRunAt
                        ? formatDistanceToNow(new Date(schedule.lastRunAt), { addSuffix: true })
                        : 'Never run'}
                    </span>
                    <button
                      onClick={() => setDeleteTarget({ id: schedule.id, name: schedule.name })}
                      className="text-[#6b7280] hover:text-[#ef4444] transition-colors p-1"
                      aria-label={`Delete ${schedule.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {['Name', 'Plugin', 'Cron', 'Human readable', 'Status', 'Last run', 'Actions'].map(h => (
                    <th key={h} className="text-left text-[#6b7280] font-medium px-4 py-3 text-xs uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {schedules.map(schedule => {
                  const plugin = pluginMap.get(schedule.pluginId)
                  return (
                    <tr key={schedule.id} className="hover:bg-[#111111] transition-colors">
                      <td className="px-4 py-3 text-[#f1f1f1]">{schedule.name}</td>
                      <td className="px-4 py-3 text-[#9ca3af]">
                        {plugin ? (
                          <span className="flex items-center gap-1.5">
                            <span>{plugin.icon}</span>
                            {plugin.name}
                          </span>
                        ) : (
                          <span className="text-[#6b7280]">{schedule.pluginId.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#9ca3af] text-xs">{schedule.cron}</td>
                      <td className="px-4 py-3 text-[#9ca3af]">{cronToHuman(schedule.cron)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggle(schedule.id)}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                            schedule.enabled
                              ? 'border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10'
                              : 'border-[#2a2a2a] text-[#6b7280] hover:border-[#3b82f6]'
                          }`}
                        >
                          {schedule.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs">
                        {schedule.lastRunAt
                          ? formatDistanceToNow(new Date(schedule.lastRunAt), { addSuffix: true })
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDeleteTarget({ id: schedule.id, name: schedule.name })}
                          className="text-[#6b7280] hover:text-[#ef4444] transition-colors"
                          aria-label={`Delete ${schedule.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run
```

Expected: All tests pass (schedules page has no existing tests; this is a pure markup change).

- [ ] **Step 3: Commit**

```bash
git -C /home/dama/repo/auto-hub add frontend/src/app/\(app\)/schedules/page.tsx
git -C /home/dama/repo/auto-hub commit -m "feat: add mobile card layout to schedules page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Calendar — replace hover with click-to-toggle popover

Rename `hoveredDay` → `selectedDay`, replace mouse enter/leave with click toggle, add outside-click dismiss via `useEffect`.

**Files:**
- Modify: `frontend/src/app/(app)/calendar/page.tsx`

**Interfaces:**
- Produces: no new exports — self-contained page change

- [ ] **Step 1: Replace the full CalendarPage component**

In `frontend/src/app/(app)/calendar/page.tsx`, make the following changes:

**a) Add `useRef` and `useCallback` to the React import:**
```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
```

**b) Replace the `CalendarPage` function entirely:**

```tsx
export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const { data, isLoading } = useCalendar()
  const containerRef = useRef<HTMLDivElement>(null)

  const schedules: ScheduledJob[] = data?.schedules ?? []
  const n8nWorkflows: N8nWorkflow[] = data?.n8nWorkflows ?? []

  // Dismiss popover when clicking outside the calendar grid
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedDay(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleDayClick = useCallback((day: Date) => {
    setSelectedDay(prev => (prev && isSameDay(prev, day) ? null : day))
  }, [])

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const firstDayOffset = getDay(startOfMonth(currentMonth))

  const hasDots = (date: Date) => ({
    blue: schedules.some(s => s.enabled && cronMatchesDay(s.cron, date)),
    purple: isToday(date) && n8nWorkflows.some(w => w.active),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280] text-sm">Loading calendar…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-xl font-semibold flex items-center gap-2">
          <Calendar size={20} className="text-[#3b82f6]" />
          {format(currentMonth, 'MMMM yyyy')}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-2 rounded-md border border-[#2a2a2a] text-[#9ca3af] hover:text-[#f1f1f1] hover:border-[#3b82f6] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1.5 text-xs rounded-md border border-[#2a2a2a] text-[#9ca3af] hover:text-[#f1f1f1] hover:border-[#3b82f6] transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-2 rounded-md border border-[#2a2a2a] text-[#9ca3af] hover:text-[#f1f1f1] hover:border-[#3b82f6] transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-[#6b7280]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
          Plugin schedules
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#a78bfa]" />
          n8n workflows
        </span>
      </div>

      <div ref={containerRef} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[#2a2a2a]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs text-[#6b7280] py-2 font-medium">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="border-b border-r border-[#2a2a2a] h-20" />
          ))}

          {days.map(day => {
            const dots = hasDots(day)
            const isSelected = selectedDay && isSameDay(selectedDay, day)
            return (
              <div
                key={day.toISOString()}
                className="calendar-day relative border-b border-r border-[#2a2a2a] h-20 p-2 cursor-pointer hover:bg-[#111111] transition-colors"
                onClick={() => handleDayClick(day)}
              >
                <span
                  className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday(day)
                      ? 'bg-[#3b82f6] text-white'
                      : 'text-[#9ca3af]'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {dots.blue && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                  )}
                  {dots.purple && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa]" />
                  )}
                </div>
                {isSelected && (
                  <DayPopover
                    date={day}
                    schedules={schedules}
                    n8nWorkflows={isToday(day) ? n8nWorkflows : []}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run
```

Expected: All tests pass (calendar page has no existing tests).

- [ ] **Step 3: Commit**

```bash
git -C /home/dama/repo/auto-hub add frontend/src/app/\(app\)/calendar/page.tsx
git -C /home/dama/repo/auto-hub commit -m "feat: replace calendar hover popover with click-to-toggle for touch support

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Build verification + push

Confirm the Next.js build compiles cleanly and push all commits.

**Files:** none

- [ ] **Step 1: Run the full test suite one final time**

```bash
cd /home/dama/repo/auto-hub/frontend
/home/dama/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Rebuild the frontend Docker image to catch TypeScript/build errors**

```bash
docker compose build frontend 2>&1 | tail -20
```

Expected: `=> exporting to image` with no TypeScript errors. If there are errors, fix them before pushing.

- [ ] **Step 3: Restart frontend and do a quick smoke test**

```bash
docker compose up -d frontend
```

Then confirm nginx can reach it:
```bash
docker exec auto-hub-nginx-1 curl -s -o /dev/null -w "%{http_code}" http://localhost/
```
Expected: `200`

- [ ] **Step 4: Push to remote**

```bash
git -C /home/dama/repo/auto-hub push
```
