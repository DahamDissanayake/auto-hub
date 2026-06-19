# Nav Restructure: Apps Page + Schedules in Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Schedules from the top-level nav, embed it as a tab inside Calendar, and replace its nav slot with a new card-based Apps launcher page.

**Architecture:** Calendar page gains a tab strip (matching Plugins) with "Calendar" and "Schedules" tabs; all schedules logic migrates there. Nav components swap `/schedules` for `/apps`. The Apps page is purely frontend — a config array drives a card grid, no backend needed.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, TanStack Query v5, lucide-react, Vitest + Testing Library

## Global Constraints

- All test files use Vitest (`describe/it/expect/vi` from `'vitest'`), `@testing-library/react`, `@testing-library/user-event`
- Run tests from `frontend/` with `npm test`
- No new dependencies — only packages already in `package.json`
- Follow existing dark-theme colour tokens: bg `#111111`/`#1a1a1a`, border `#2a2a2a`, text `#f1f1f1`/`#9ca3af`/`#6b7280`, blue `#3b82f6`
- Tab strip pattern: `border-b border-[#2a2a2a]` container, active tab has `border-b-2 border-[#3b82f6] text-[#3b82f6]`, inactive has `border-transparent text-[#6b7280] hover:text-[#9ca3af]`
- Card grid pattern: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/components/layout/Sidebar.tsx` | Swap `/schedules` nav item for `/apps` |
| Modify | `frontend/src/components/layout/BottomNav.tsx` | Same |
| Modify | `frontend/src/components/layout/Sidebar.test.tsx` | Update assertions for new nav items |
| Modify | `frontend/src/components/layout/BottomNav.test.tsx` | Update assertions for new nav items |
| Modify | `frontend/src/app/(app)/calendar/page.tsx` | Add tab strip; embed full schedules UI as second tab |
| Delete | `frontend/src/app/(app)/schedules/page.tsx` | No longer a route — logic moved to calendar |
| Create | `frontend/src/app/(app)/apps/apps.config.ts` | App definitions array (source of truth for launcher) |
| Create | `frontend/src/app/(app)/apps/page.tsx` | Card-grid launcher page |
| Create | `frontend/appcreator.md` | Developer guide for adding new apps |

---

## Task 1: Update nav components — swap Schedules for Apps

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/BottomNav.tsx`
- Modify: `frontend/src/components/layout/Sidebar.test.tsx`
- Modify: `frontend/src/components/layout/BottomNav.test.tsx`

**Interfaces:**
- Produces: `/apps` nav link in both Sidebar and BottomNav

- [ ] **Step 1: Update Sidebar.test.tsx — replace Schedules with Apps in assertions**

Replace the entire `renders all navigation items` test body and update the `aria-current` test if needed. Full updated test file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

import Sidebar from './Sidebar'
import { usePathname, useRouter } from 'next/navigation'

const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true })

describe('Sidebar', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any)
  })

  it('renders AutoHub branding', () => {
    render(<Sidebar />)
    expect(screen.getByText('AutoHub')).toBeInTheDocument()
  })

  it('renders all navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Plugins')).toBeInTheDocument()
    expect(screen.getByText('Apps')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('n8n Workflows')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Schedules')).not.toBeInTheDocument()
  })

  it('applies active style to current path link', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<Sidebar />)
    const pluginsLink = screen.getByText('Plugins').closest('a')
    expect(pluginsLink).toHaveClass('text-[#3b82f6]')
  })

  it('clears sessionStorage and redirects on logout', async () => {
    const mockReplace = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace } as any)
    sessionStorage.setItem('autohub_token', 'test-token')
    render(<Sidebar />)
    await userEvent.click(screen.getByTestId('logout-button'))
    expect(sessionStorage.getItem('autohub_token')).toBeNull()
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })

  it('has hidden md:flex classes for responsive visibility', () => {
    render(<Sidebar />)
    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('hidden')
    expect(aside.className).toContain('md:flex')
  })
})
```

- [ ] **Step 2: Update BottomNav.test.tsx — replace Schedules with Apps**

Full updated test file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className, 'aria-current': ariaCurrent }: any) => (
    <a href={href} className={className} aria-current={ariaCurrent}>{children}</a>
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
    expect(screen.getByText('Apps')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('n8n')).toBeInTheDocument()
    expect(screen.queryByText('Schedules')).not.toBeInTheDocument()
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

  it('has flex md:hidden classes for responsive visibility', () => {
    render(<BottomNav />)
    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(nav.className).toContain('flex')
    expect(nav.className).toContain('md:hidden')
  })

  it('sets aria-current on active item', () => {
    vi.mocked(usePathname).mockReturnValue('/apps')
    render(<BottomNav />)
    const activeLink = screen.getByText('Apps').closest('a')
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    const inactiveLink = screen.getByText('Dashboard').closest('a')
    expect(inactiveLink).not.toHaveAttribute('aria-current')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E 'FAIL|PASS|✓|✗|×|Apps|Schedules'
```

Expected: Sidebar and BottomNav test suites FAIL (Apps not found, Schedules still present).

- [ ] **Step 4: Update Sidebar.tsx**

Replace the `navItems` array and update the import. Full updated file:

```tsx
'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Puzzle, LayoutGrid, Calendar,
  GitBranch, Settings, LogOut,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Plugins', icon: Puzzle },
  { href: '/apps', label: 'Apps', icon: LayoutGrid },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/n8n-workflows', label: 'n8n Workflows', icon: GitBranch },
]

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] pl-[10px]'
          : 'text-[#9ca3af] hover:text-[#f1f1f1] hover:bg-[#1a1a1a]'
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = () => {
    sessionStorage.removeItem('autohub_token')
    router.replace('/login')
  }

  return (
    <aside className="hidden md:flex w-56 bg-[#111111] border-r border-[#2a2a2a] flex-col h-screen sticky top-0 shrink-0">
      <div className="p-4 border-b border-[#2a2a2a] flex items-center gap-2">
        <Image
          src="/img/Base Logo - Light.png"
          alt="AutoHub logo"
          width={44}
          height={24}
          className="object-contain"
          priority
        />
        <span className="text-white font-medium text-sm">AutoHub</span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isActive={pathname === item.href}
          />
        ))}
      </nav>

      <div className="p-2 border-t border-[#2a2a2a] space-y-0.5">
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          isActive={pathname === '/settings'}
        />
        <button
          onClick={handleLogout}
          data-testid="logout-button"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#1a1a1a] w-full transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Update BottomNav.tsx**

Full updated file:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Puzzle, LayoutGrid, Calendar, GitBranch } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Plugins', icon: Puzzle },
  { href: '/apps', label: 'Apps', icon: LayoutGrid },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/n8n-workflows', label: 'n8n', icon: GitBranch },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Mobile navigation" className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#111111] border-t border-[#2a2a2a]">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
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

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E 'FAIL|PASS|✓|✗|×|Sidebar|BottomNav'
```

Expected: Sidebar and BottomNav test suites PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx \
        frontend/src/components/layout/BottomNav.tsx \
        frontend/src/components/layout/Sidebar.test.tsx \
        frontend/src/components/layout/BottomNav.test.tsx
git commit -m "feat: swap Schedules nav item for Apps in Sidebar and BottomNav"
```

---

## Task 2: Embed Schedules as a tab in Calendar; delete schedules route

**Files:**
- Modify: `frontend/src/app/(app)/calendar/page.tsx`
- Delete: `frontend/src/app/(app)/schedules/page.tsx`

**Interfaces:**
- Consumes: `useSchedules`, `useDeleteSchedule`, `useToggleSchedule` from `@/lib/hooks/useSchedules`; `usePlugins` from `@/lib/hooks/usePlugins`; `useToast` from `@/components/ui/Toast`; `Modal` from `@/components/ui/Modal`; `ScheduleModal` from `@/components/plugins/ScheduleModal`; `cronToHuman` from `@/lib/utils/cron`
- Produces: `/calendar` route with two tabs — `'calendar'` (existing grid) and `'schedules'` (full schedules table)

- [ ] **Step 1: Write the updated calendar/page.tsx with tab strip and embedded schedules**

This is the full replacement for `frontend/src/app/(app)/calendar/page.tsx`. It combines the existing calendar logic with all schedules logic inline:

```tsx
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isToday, format, addMonths, subMonths, formatDistanceToNow,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar, Clock, Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { cronMatchesDay, cronToHuman } from '@/lib/utils/cron'
import { useSchedules, useDeleteSchedule, useToggleSchedule } from '@/lib/hooks/useSchedules'
import { usePlugins } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import ScheduleModal from '@/components/plugins/ScheduleModal'
import type { CalendarData, ScheduledJob, N8nWorkflow, Plugin } from '@/lib/types'

type Tab = 'calendar' | 'schedules'

function useCalendarData() {
  return useQuery<CalendarData>({
    queryKey: ['calendar'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard/calendar')
      return data
    },
  })
}

function DayPopover({
  date,
  schedules,
  n8nWorkflows,
}: {
  date: Date
  schedules: ScheduledJob[]
  n8nWorkflows: N8nWorkflow[]
}) {
  const daySchedules = schedules.filter(s => s.enabled && cronMatchesDay(s.cron, date))
  const dayWorkflows = n8nWorkflows.filter(w => w.active)

  if (daySchedules.length === 0 && dayWorkflows.length === 0) return null

  return (
    <div className="absolute top-full left-0 mt-1 z-20 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 w-56 shadow-xl">
      {daySchedules.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">Plugins</p>
          {daySchedules.map(s => (
            <p key={s.id} className="text-xs text-[#f1f1f1] flex items-start gap-1.5 min-w-0">
              <svg width="4" height="4" viewBox="0 0 4 4" fill="currentColor" className="shrink-0 mt-1 text-[#3b82f6]"><circle cx="2" cy="2" r="2" /></svg>
              <span className="truncate">{s.name} <span className="text-[#6b7280]">({cronToHuman(s.cron)})</span></span>
            </p>
          ))}
        </div>
      )}
      {dayWorkflows.length > 0 && (
        <div>
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">n8n</p>
          {dayWorkflows.map(w => (
            <p key={w.id} className="text-xs text-[#a78bfa] flex items-start gap-1.5 min-w-0">
              <svg width="4" height="4" viewBox="0 0 4 4" fill="currentColor" className="shrink-0 mt-1"><circle cx="2" cy="2" r="2" /></svg>
              <span className="truncate">{w.name}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  scheduleName,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  scheduleName: string
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Schedule">
      <p className="text-[#9ca3af] text-sm mb-6">
        Delete <span className="text-white font-medium">{scheduleName}</span>? This cannot be undone.
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm border border-[#2a2a2a] text-[#9ca3af] rounded-md hover:text-[#f1f1f1] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm bg-[#ef4444] text-white rounded-md hover:bg-[#dc2626] transition-colors"
        >
          Delete
        </button>
      </div>
    </Modal>
  )
}

function CalendarTab() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const { data, isLoading } = useCalendarData()
  const containerRef = useRef<HTMLDivElement>(null)

  const schedules: ScheduledJob[] = data?.schedules ?? []
  const n8nWorkflows: N8nWorkflow[] = data?.n8nWorkflows ?? []

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[#f1f1f1] text-sm font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
          <div className="flex gap-1">
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
      </div>

      <div ref={containerRef} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-visible">
        <div className="grid grid-cols-7 border-b border-[#2a2a2a]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs text-[#6b7280] py-2 font-medium">
              {day}
            </div>
          ))}
        </div>

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

function SchedulesTab() {
  const { data: schedules, isLoading } = useSchedules()
  const { data: plugins } = usePlugins()
  const deleteSchedule = useDeleteSchedule()
  const toggleSchedule = useToggleSchedule()
  const toast = useToast()

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null)

  const pluginMap = new Map((plugins ?? []).map(p => [p.id, p]))

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteSchedule.mutateAsync(deleteTarget.id)
      toast.success('Schedule deleted')
    } catch {
      toast.error('Failed to delete schedule')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await toggleSchedule.mutateAsync(id)
    } catch {
      toast.error('Failed to toggle schedule')
    }
  }

  const handleAddOpen = () => {
    const firstPlugin = plugins?.[0]
    if (!firstPlugin) {
      toast.info('No plugins installed. Install a plugin first.')
      return
    }
    setSelectedPlugin(firstPlugin)
    setAddOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280] text-sm">Loading schedules…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={handleAddOpen}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] transition-colors"
        >
          <Plus size={14} />
          Add Schedule
        </button>
      </div>

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
                    <span>{plugin?.name ?? schedule.pluginId.slice(0, 8) + '…'}</span>
                    <span className="text-[#6b7280]">{cronToHuman(schedule.cron)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#6b7280]">
                    <span>
                      {schedule.lastRunAt
                        ? formatDistanceToNow(new Date(schedule.lastRunAt), { addSuffix: true })
                        : 'Never'}
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
                        {plugin ? plugin.name : (
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

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        scheduleName={deleteTarget?.name ?? ''}
      />

      {selectedPlugin && (
        <ScheduleModal
          plugin={selectedPlugin}
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}

export default function CalendarPage() {
  const [tab, setTab] = useState<Tab>('calendar')

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <Calendar size={20} className="text-[#3b82f6]" />
        Calendar
      </h1>

      {/* Tab strip */}
      <div className="flex border-b border-[#2a2a2a] gap-1">
        <button
          onClick={() => setTab('calendar')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'calendar'
              ? 'border-[#3b82f6] text-[#3b82f6]'
              : 'border-transparent text-[#6b7280] hover:text-[#9ca3af]'
          }`}
        >
          <Calendar size={14} />
          Calendar
        </button>
        <button
          onClick={() => setTab('schedules')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'schedules'
              ? 'border-[#3b82f6] text-[#3b82f6]'
              : 'border-transparent text-[#6b7280] hover:text-[#9ca3af]'
          }`}
        >
          <Clock size={14} />
          Schedules
        </button>
      </div>

      {tab === 'calendar' && <CalendarTab />}
      {tab === 'schedules' && <SchedulesTab />}
    </div>
  )
}
```

- [ ] **Step 2: Delete the schedules page**

```bash
rm frontend/src/app/\(app\)/schedules/page.tsx
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 4: Run all tests to confirm nothing broken**

```bash
cd frontend && npm test 2>&1 | tail -20
```

Expected: all test suites PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(app\)/calendar/page.tsx
git rm frontend/src/app/\(app\)/schedules/page.tsx
git commit -m "feat: embed Schedules as tab inside Calendar page; remove schedules route"
```

---

## Task 3: Create Apps launcher page

**Files:**
- Create: `frontend/src/app/(app)/apps/apps.config.ts`
- Create: `frontend/src/app/(app)/apps/page.tsx`

**Interfaces:**
- Produces: `AppEntry` interface; `/apps` route rendering a card grid from `apps` array

- [ ] **Step 1: Create `apps.config.ts`**

```ts
export interface AppEntry {
  id: string
  name: string
  description: string
  url: string
  iconPath?: string  // relative to /public, e.g. "/img/icons/foo.png"
  color?: string     // hex accent, defaults to #3b82f6
}

export const apps: AppEntry[] = []
```

- [ ] **Step 2: Create `apps/page.tsx`**

```tsx
'use client'
import { ExternalLink, LayoutGrid } from 'lucide-react'
import Image from 'next/image'
import { apps } from './apps.config'
import type { AppEntry } from './apps.config'

function AppCard({ app }: { app: AppEntry }) {
  const accent = app.color ?? '#3b82f6'
  return (
    <a
      href={app.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex items-start gap-3 hover:border-[#3b82f6]/50 transition-colors"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white font-semibold text-sm"
        style={{ backgroundColor: accent + '22', color: accent }}
      >
        {app.iconPath ? (
          <Image src={app.iconPath} alt={app.name} width={28} height={28} className="object-contain" />
        ) : (
          app.name[0].toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[#f1f1f1] text-sm font-medium truncate">{app.name}</p>
          <ExternalLink size={12} className="text-[#6b7280] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-[#6b7280] text-xs mt-0.5 line-clamp-2">{app.description}</p>
      </div>
    </a>
  )
}

export default function AppsPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <LayoutGrid size={20} className="text-[#3b82f6]" />
        Apps
      </h1>

      {apps.length === 0 ? (
        <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
          No apps configured yet — see{' '}
          <code className="text-[#9ca3af] bg-[#111111] px-1 rounded">appcreator.md</code>{' '}
          to add one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map(app => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors from the new files.

- [ ] **Step 4: Run all tests**

```bash
cd frontend && npm test 2>&1 | tail -10
```

Expected: all test suites PASS (no new tests needed — the page has no logic to unit-test; it's a static config renderer).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(app\)/apps/apps.config.ts \
        frontend/src/app/\(app\)/apps/page.tsx
git commit -m "feat: add Apps launcher page with config-driven card grid"
```

---

## Task 4: Write appcreator.md

**Files:**
- Create: `frontend/appcreator.md`

**Interfaces:**
- Consumes: `AppEntry` from `src/app/(app)/apps/apps.config.ts`

- [ ] **Step 1: Create `frontend/appcreator.md`**

```markdown
# App Creator Guide

How to add a new app to the Apps launcher in AutoHub.

## Where apps are defined

All apps live in one file:

```
frontend/src/app/(app)/apps/apps.config.ts
```

Open it and add an entry to the `apps` array.

## AppEntry fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier, e.g. `"portainer"` |
| `name` | `string` | Yes | Display name shown on the card |
| `description` | `string` | Yes | Short description (1-2 sentences) |
| `url` | `string` | Yes | Full URL the card links to |
| `iconPath` | `string` | No | Path to icon relative to `/public`, e.g. `"/img/icons/portainer.png"` |
| `color` | `string` | No | Hex accent colour for the icon background, e.g. `"#13BEF9"`. Defaults to `#3b82f6` |

## Example entry

```ts
{
  id: 'portainer',
  name: 'Portainer',
  description: 'Docker container management UI',
  url: 'http://homelab.local:9000',
  iconPath: '/img/icons/portainer.png',
  color: '#13BEF9',
}
```

## Adding an icon

1. Drop a PNG or SVG into `frontend/public/img/icons/`
2. Recommended size: 64×64 px (displayed at 28×28)
3. Set `iconPath` to `"/img/icons/<filename>"`

If no `iconPath` is set, the card shows the first letter of the app name as a coloured initial.

## What counts as an "app"

Anything with a URL:
- Internal Docker services (e.g. Portainer, Grafana, Home Assistant)
- Local tools running on the network
- External web apps or dashboards
- Raspberry Pi services

## Rebuilding after changes

The config is compiled into the Next.js build. In development (`npm run dev`) changes hot-reload instantly. In production, rebuild and redeploy the frontend container after editing `apps.config.ts`.
```

- [ ] **Step 2: Commit**

```bash
git add frontend/appcreator.md
git commit -m "docs: add appcreator.md guide for adding apps to the launcher"
```
