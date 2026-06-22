# Nav: Settings Fix + Recent Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Settings being misplaced in the mobile nav drawer, and add a "5 most recently used apps" sub-list under the Apps link in both the desktop Sidebar and MobileNav.

**Architecture:** A new `useRecentApps` hook reads/writes a capped 5-entry list in `localStorage`. A client `AppVisitRecorder` component fires `recordAppVisit(id)` on every `/apps/[id]` page mount. Both Sidebar and MobileNav consume `useRecentApps()` to render the sub-list below the Apps nav link. Settings is removed from `navItems` in MobileNav and placed in the bottom footer section alongside Logout.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Vitest + React Testing Library

## Global Constraints

- Test framework: **Vitest** — import `describe, it, expect, vi, beforeEach` from `'vitest'`; run with `npm test` in `frontend/`
- Path alias: `@/` resolves to `frontend/src/`
- `localStorage` key: `autohub_recent_apps`
- Stored entry shape: `{ id: string; lastUsed: number }`
- Max 5 entries, sorted newest-first; enforced at write time
- On SSR or unavailable `localStorage`: functions return `[]` silently (wrap in try/catch)
- App ids come from `apps.config.ts` — filter out stale ids at read time
- Route for individual apps: `/apps/[id]`
- Do **not** change `BottomNav.tsx`
- Tailwind colour tokens to match existing nav: `text-[#6b7280]`, `text-[#9ca3af]`, `hover:text-[#f1f1f1]`, `hover:bg-[#1a1a1a]`, `text-[#3b82f6]`, `bg-[#3b82f6]/10`, active border `border-[#3b82f6]`

---

### Task 1: `useRecentApps` hook

**Files:**
- Create: `frontend/src/lib/hooks/useRecentApps.ts`
- Create: `frontend/src/lib/hooks/useRecentApps.test.ts`

**Interfaces:**
- Produces:
  - `recordAppVisit(id: string): void` — named export, pure function (no React), writes to `localStorage`
  - `useRecentApps(): AppEntry[]` — React hook, returns resolved `AppEntry[]` newest-first

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/hooks/useRecentApps.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { recordAppVisit, useRecentApps } from './useRecentApps'

vi.mock('@/app/(app)/apps/apps.config', () => ({
  apps: [
    { id: 'app-a', name: 'App A', description: '', url: '/a', color: '#ff0000' },
    { id: 'app-b', name: 'App B', description: '', url: '/b', color: '#00ff00' },
    { id: 'app-c', name: 'App C', description: '', url: '/c', color: '#0000ff' },
    { id: 'app-d', name: 'App D', description: '', url: '/d', color: '#ffff00' },
    { id: 'app-e', name: 'App E', description: '', url: '/e', color: '#ff00ff' },
    { id: 'app-f', name: 'App F', description: '', url: '/f', color: '#00ffff' },
  ],
}))

beforeEach(() => localStorage.clear())

describe('recordAppVisit', () => {
  it('records a visit', () => {
    recordAppVisit('app-a')
    const raw = JSON.parse(localStorage.getItem('autohub_recent_apps') ?? '[]')
    expect(raw[0].id).toBe('app-a')
    expect(typeof raw[0].lastUsed).toBe('number')
  })

  it('moves an existing entry to front on revisit', () => {
    recordAppVisit('app-a')
    recordAppVisit('app-b')
    recordAppVisit('app-a')
    const raw = JSON.parse(localStorage.getItem('autohub_recent_apps') ?? '[]')
    expect(raw[0].id).toBe('app-a')
    expect(raw[1].id).toBe('app-b')
    expect(raw).toHaveLength(2)
  })

  it('caps at 5 entries', () => {
    ;['app-a', 'app-b', 'app-c', 'app-d', 'app-e', 'app-f'].forEach(recordAppVisit)
    const raw = JSON.parse(localStorage.getItem('autohub_recent_apps') ?? '[]')
    expect(raw).toHaveLength(5)
    expect(raw[0].id).toBe('app-f') // most recent
    expect(raw[4].id).toBe('app-b') // oldest kept
  })
})

describe('useRecentApps', () => {
  it('returns empty array when nothing recorded', () => {
    const { result } = renderHook(() => useRecentApps())
    expect(result.current).toEqual([])
  })

  it('returns resolved AppEntry objects newest-first', () => {
    recordAppVisit('app-a')
    recordAppVisit('app-b')
    const { result } = renderHook(() => useRecentApps())
    expect(result.current[0].id).toBe('app-b')
    expect(result.current[1].id).toBe('app-a')
    expect(result.current[0].name).toBe('App B')
  })

  it('filters out ids not present in apps config', () => {
    recordAppVisit('ghost-app')
    recordAppVisit('app-a')
    const { result } = renderHook(() => useRecentApps())
    expect(result.current).toHaveLength(1)
    expect(result.current[0].id).toBe('app-a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/auto-hub/frontend && npm test -- useRecentApps 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module './useRecentApps'"

- [ ] **Step 3: Implement the hook**

Create `frontend/src/lib/hooks/useRecentApps.ts`:

```ts
'use client'
import { useState, useEffect } from 'react'
import { apps } from '@/app/(app)/apps/apps.config'
import type { AppEntry } from '@/app/(app)/apps/apps.config'

const KEY = 'autohub_recent_apps'
const MAX = 5

interface RecentEntry { id: string; lastUsed: number }

function readEntries(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function recordAppVisit(id: string): void {
  try {
    const entries = readEntries().filter(e => e.id !== id)
    entries.unshift({ id, lastUsed: Date.now() })
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)))
  } catch {
    // localStorage unavailable (SSR, private mode) — silently ignore
  }
}

export function useRecentApps(): AppEntry[] {
  const [recent, setRecent] = useState<AppEntry[]>([])

  useEffect(() => {
    const entries = readEntries()
    const resolved = entries
      .map(e => apps.find(a => a.id === e.id))
      .filter((a): a is AppEntry => a !== undefined)
    setRecent(resolved)
  }, [])

  return recent
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /workspace/auto-hub/frontend && npm test -- useRecentApps 2>&1 | tail -20
```

Expected: PASS — 6 tests green

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/hooks/useRecentApps.ts frontend/src/lib/hooks/useRecentApps.test.ts
git commit -m "feat: add useRecentApps hook with localStorage persistence"
```

---

### Task 2: Record app visit on `/apps/[id]` mount

**Files:**
- Create: `frontend/src/app/(app)/apps/[id]/AppVisitRecorder.tsx`
- Modify: `frontend/src/app/(app)/apps/[id]/page.tsx`

**Interfaces:**
- Consumes: `recordAppVisit(id: string)` from `@/lib/hooks/useRecentApps`
- Produces: `AppVisitRecorder` default export — client component, renders `null`

- [ ] **Step 1: Create `AppVisitRecorder.tsx`**

Create `frontend/src/app/(app)/apps/[id]/AppVisitRecorder.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { recordAppVisit } from '@/lib/hooks/useRecentApps'

export default function AppVisitRecorder({ id }: { id: string }) {
  useEffect(() => { recordAppVisit(id) }, [id])
  return null
}
```

- [ ] **Step 2: Update `[id]/page.tsx` to include the recorder**

Replace the entire contents of `frontend/src/app/(app)/apps/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { apps } from '../apps.config'
import TerminalPage from '../../terminal/page'
import DockerMonitorPage from '../../docker/page'
import FilesPage from '../../files/page'
import AppVisitRecorder from './AppVisitRecorder'

const INTERNAL_PAGES: Record<string, React.ComponentType> = {
  'claude-terminal': TerminalPage as React.ComponentType,
  'docker-monitor': DockerMonitorPage as React.ComponentType,
  'files': FilesPage as React.ComponentType,
}

export default function AppPage({ params }: { params: { id: string } }) {
  const app = apps.find(a => a.id === params.id)
  if (!app) return notFound()

  const InternalPage = INTERNAL_PAGES[app.id]
  if (InternalPage) {
    return (
      <>
        <AppVisitRecorder id={app.id} />
        <InternalPage />
      </>
    )
  }

  return (
    <>
      <AppVisitRecorder id={app.id} />
      <iframe
        src={app.url}
        className="-m-4 md:-m-6 lg:-m-8 w-[calc(100%+2rem)] md:w-[calc(100%+3rem)] lg:w-[calc(100%+4rem)] h-[calc(100dvh-57px)] md:h-[calc(100dvh-0px)] border-0"
        title={app.name}
        allow="fullscreen"
      />
    </>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(app)/apps/[id]/AppVisitRecorder.tsx" "frontend/src/app/(app)/apps/[id]/page.tsx"
git commit -m "feat: record app visit in localStorage on /apps/[id] mount"
```

---

### Task 3: Fix MobileNav Settings placement + add recent apps sub-list to Sidebar and MobileNav

**Files:**
- Modify: `frontend/src/components/layout/MobileNav.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/Sidebar.test.tsx`
- Create: `frontend/src/components/layout/MobileNav.test.tsx`

**Interfaces:**
- Consumes: `useRecentApps(): AppEntry[]` from `@/lib/hooks/useRecentApps`

- [ ] **Step 1: Write failing tests for MobileNav**

Create `frontend/src/components/layout/MobileNav.test.tsx`:

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

vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}))

vi.mock('@/lib/hooks/useRecentApps', () => ({
  useRecentApps: vi.fn(() => []),
}))

import { MobileNav } from './MobileNav'
import { usePathname } from 'next/navigation'
import { useRecentApps } from '@/lib/hooks/useRecentApps'

describe('MobileNav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useRecentApps).mockReturnValue([])
  })

  it('renders main nav items (excluding Settings)', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Apps')).toBeInTheDocument()
    expect(screen.getByText('n8n Workflows')).toBeInTheDocument()
  })

  it('renders Settings in the bottom section alongside Logout', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />)
    const settings = screen.getByText('Settings')
    const logout = screen.getByText('Logout')
    // Both must be inside the same footer div (border-t section)
    expect(settings.closest('[class*="border-t"]')).toBe(logout.closest('[class*="border-t"]'))
  })

  it('Settings is NOT in the main scrollable nav list', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />)
    const settings = screen.getByText('Settings')
    // Must not be inside the <nav> element
    expect(settings.closest('nav')).toBeNull()
  })

  it('shows recent apps sub-list under Apps when visits exist', () => {
    vi.mocked(useRecentApps).mockReturnValue([
      { id: 'files', name: 'Files', description: '', url: '/files', color: '#f59e0b' },
      { id: 'claude-terminal', name: 'Code Terminal', description: '', url: '/terminal', color: '#10b981' },
    ])
    render(<MobileNav open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('Code Terminal')).toBeInTheDocument()
  })

  it('shows no recent apps sub-list when no visits recorded', () => {
    vi.mocked(useRecentApps).mockReturnValue([])
    render(<MobileNav open={true} onClose={vi.fn()} />)
    // Only the main "Apps" nav link should be present; no app names below it
    expect(screen.queryByText('Files')).not.toBeInTheDocument()
  })

  it('recent app links point to /apps/[id]', () => {
    vi.mocked(useRecentApps).mockReturnValue([
      { id: 'files', name: 'Files', description: '', url: '/files', color: '#f59e0b' },
    ])
    render(<MobileNav open={true} onClose={vi.fn()} />)
    const link = screen.getByText('Files').closest('a')
    expect(link).toHaveAttribute('href', '/apps/files')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /workspace/auto-hub/frontend && npm test -- MobileNav 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module './MobileNav'" or component assertion failures

- [ ] **Step 3: Add failing test for Sidebar recent apps**

Add the following to `frontend/src/components/layout/Sidebar.test.tsx` — insert these three lines near the top (after the existing `vi.mock('next/navigation', ...)` block) and the new test at the bottom of the `describe` block:

At the top of the file, add after the existing mocks:

```tsx
vi.mock('@/lib/hooks/useRecentApps', () => ({
  useRecentApps: vi.fn(() => []),
}))
```

Add this import after the `import Sidebar from './Sidebar'` line:

```tsx
import { useRecentApps } from '@/lib/hooks/useRecentApps'
```

Add this test at the bottom of the `describe('Sidebar', ...)` block:

```tsx
  it('shows recent apps sub-list under Apps when visits exist', () => {
    vi.mocked(useRecentApps).mockReturnValue([
      { id: 'files', name: 'Files', description: '', url: '/files', color: '#f59e0b' },
      { id: 'claude-terminal', name: 'Code Terminal', description: '', url: '/terminal', color: '#10b981' },
    ])
    render(<Sidebar />)
    const filesLink = screen.getByText('Files').closest('a')
    expect(filesLink).toHaveAttribute('href', '/apps/files')
    expect(screen.getByText('Code Terminal')).toBeInTheDocument()
  })
```

- [ ] **Step 4: Run Sidebar tests to verify they fail**

```bash
cd /workspace/auto-hub/frontend && npm test -- Sidebar 2>&1 | tail -20
```

Expected: FAIL on the new "shows recent apps sub-list" test; existing tests may also fail because `useRecentApps` is now mocked but not yet imported by Sidebar

- [ ] **Step 5: Implement MobileNav changes**

Replace the entire contents of `frontend/src/components/layout/MobileNav.tsx`:

```tsx
'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Zap, LayoutGrid, Calendar,
  GitBranch, Settings, LogOut, X,
} from 'lucide-react'
import { useRecentApps } from '@/lib/hooks/useRecentApps'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Shortcuts', icon: Zap },
  { href: '/apps', label: 'Apps', icon: LayoutGrid },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/n8n-workflows', label: 'n8n Workflows', icon: GitBranch },
]

interface MobileNavProps {
  open: boolean
  onClose: () => void
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const drawerRef = useRef<HTMLDivElement>(null)
  const recentApps = useRecentApps()

  // Close on route change
  useEffect(() => { onClose() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleLogout = () => {
    sessionStorage.removeItem('autohub_token')
    router.replace('/login')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`md:hidden fixed top-0 right-0 bottom-0 z-50 w-72 bg-[#111111] border-l border-[#2a2a2a] flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2.5">
            <Image
              src="/img/Base Logo - Light.png"
              alt="AutoHub"
              width={36}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-white font-semibold text-sm">AutoHub</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-white hover:bg-[#2a2a2a] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <div key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] pl-[14px]'
                      : 'text-[#9ca3af] hover:text-[#f1f1f1] hover:bg-[#1a1a1a] active:bg-[#1a1a1a]'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
                {href === '/apps' && recentApps.length > 0 && (
                  <div className="mt-0.5 space-y-0.5 pl-4">
                    {recentApps.map(app => {
                      const isAppActive = pathname === `/apps/${app.id}`
                      return (
                        <Link
                          key={app.id}
                          href={`/apps/${app.id}`}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
                            isAppActive
                              ? 'text-[#3b82f6] bg-[#3b82f6]/10'
                              : 'text-[#6b7280] hover:text-[#f1f1f1] hover:bg-[#1a1a1a]'
                          }`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: app.color ?? '#3b82f6' }}
                          />
                          <span className="truncate">{app.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom — Settings + Logout */}
        <div className="p-3 border-t border-[#2a2a2a] space-y-0.5">
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
              pathname === '/settings'
                ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] pl-[14px]'
                : 'text-[#9ca3af] hover:text-[#f1f1f1] hover:bg-[#1a1a1a]'
            }`}
          >
            <Settings size={18} />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#1a1a1a] w-full transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Implement Sidebar changes**

Replace the entire contents of `frontend/src/components/layout/Sidebar.tsx`:

```tsx
'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Zap, LayoutGrid, Calendar,
  GitBranch, Settings, LogOut,
} from 'lucide-react'
import { useRecentApps } from '@/lib/hooks/useRecentApps'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Shortcuts', icon: Zap },
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
  const recentApps = useRecentApps()

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
          <div key={item.href}>
            <NavLink
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={pathname === item.href}
            />
            {item.href === '/apps' && recentApps.length > 0 && (
              <div className="mt-0.5 space-y-0.5 pl-3">
                {recentApps.map(app => {
                  const isAppActive = pathname === `/apps/${app.id}`
                  return (
                    <Link
                      key={app.id}
                      href={`/apps/${app.id}`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                        isAppActive
                          ? 'text-[#3b82f6] bg-[#3b82f6]/10'
                          : 'text-[#6b7280] hover:text-[#f1f1f1] hover:bg-[#1a1a1a]'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: app.color ?? '#3b82f6' }}
                      />
                      <span className="truncate">{app.name}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
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

- [ ] **Step 7: Run all tests**

```bash
cd /workspace/auto-hub/frontend && npm test 2>&1 | tail -30
```

Expected: all tests pass, including new ones for MobileNav and Sidebar recent apps

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/layout/MobileNav.tsx \
        frontend/src/components/layout/MobileNav.test.tsx \
        frontend/src/components/layout/Sidebar.tsx \
        frontend/src/components/layout/Sidebar.test.tsx
git commit -m "feat: fix Settings in mobile nav, add recent apps sub-list to sidebar and mobile menu"
```

---

## Self-Review Checklist

- [x] Spec: Settings removed from MobileNav `navItems`, placed in bottom section → Task 3 Steps 5
- [x] Spec: Settings fix applies to both Sidebar (already correct) and MobileNav → Task 3 Steps 5–6
- [x] Spec: `recordAppVisit` fires on every `/apps/[id]` mount → Task 2
- [x] Spec: Max 5 entries, newest first → Task 1 Step 3
- [x] Spec: Filter stale ids at read time → Task 1 Step 3 (`useRecentApps`)
- [x] Spec: Sub-list hidden when no recent apps → tests assert empty state
- [x] Spec: Recent apps link to `/apps/[id]` → MobileNav test Step 1, Sidebar test Step 3
- [x] Spec: BottomNav not changed → not mentioned anywhere in tasks
- [x] Type consistency: `recordAppVisit(id: string)` matches across Task 1 and Task 2
- [x] Type consistency: `useRecentApps(): AppEntry[]` matches across Task 1 and Task 3
- [x] No placeholders or TBDs
