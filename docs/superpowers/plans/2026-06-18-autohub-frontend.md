# AutoHub Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete AutoHub Next.js 14 frontend — 6 pages, shared layout, reusable UI components, React Query data hooks, Vitest test suite, and the final integration test runbook in `dev-logs/testings.md`.

**Architecture:** Client-side rendering via React Query hooks. All authenticated pages wrapped in `AppShell` (JWT check + redirect). No external UI libraries — Tailwind only. Axios instance in `lib/api.ts` handles auth headers and 401 redirects globally.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, @tanstack/react-query, axios, lucide-react, date-fns, Vitest + React Testing Library

**Prerequisite:** Plan 1 (backend) must be complete and the API must be reachable at `http://localhost/api` when running via Docker Compose.

---

## File Map

```
frontend/
├── Dockerfile
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── vitest.setup.ts
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx                    ← root layout, QueryClientProvider + ToastProvider
    │   ├── providers.tsx                 ← 'use client' QueryClient + Toast setup
    │   ├── (auth)/
    │   │   └── login/
    │   │       └── page.tsx
    │   └── (app)/
    │       ├── layout.tsx                ← renders AppShell
    │       ├── page.tsx                  ← / Dashboard
    │       ├── plugins/page.tsx
    │       ├── schedules/page.tsx
    │       ├── calendar/page.tsx
    │       ├── n8n-workflows/page.tsx
    │       └── settings/page.tsx
    ├── components/
    │   ├── layout/
    │   │   ├── AppShell.tsx
    │   │   └── Sidebar.tsx
    │   ├── ui/
    │   │   ├── StatCard.tsx
    │   │   ├── StatusBadge.tsx
    │   │   ├── Toast.tsx
    │   │   └── Modal.tsx
    │   └── plugins/
    │       ├── PluginCard.tsx
    │       ├── ConfigModal.tsx
    │       └── ScheduleModal.tsx
    └── lib/
        ├── api.ts
        ├── types.ts
        ├── utils/
        │   └── cron.ts
        └── hooks/
            ├── useDashboard.ts
            ├── usePlugins.ts
            ├── useSchedules.ts
            ├── useN8nWorkflows.ts
            └── useHealth.ts
```

---

## Task 1: Frontend Scaffold + Config Files

**Files:**
- Create: `frontend/` (via create-next-app)
- Create: `frontend/next.config.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Scaffold Next.js app**

Run from the repo root (not inside `frontend/`):

```bash
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git --yes
```

This creates `frontend/` with Next.js 14 App Router, TypeScript, Tailwind, and the `@/*` alias.

- [ ] **Step 2: Install additional dependencies**

```bash
cd frontend
npm install axios @tanstack/react-query lucide-react date-fns
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Replace `frontend/next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {},
}

export default nextConfig
```

- [ ] **Step 4: Replace `frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#111111',
        card: '#1a1a1a',
        border: '#2a2a2a',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 5: Create `frontend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 6: Create `frontend/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 7: Add test script to `frontend/package.json`**

Open `frontend/package.json` and add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 8: Replace `frontend/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  background-color: #0a0a0a;
  color: #f1f1f1;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #111111;
}
::-webkit-scrollbar-thumb {
  background: #2a2a2a;
  border-radius: 3px;
}
```

- [ ] **Step 9: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
```

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Next.js 14 frontend with Tailwind, Vitest, Dockerfile"
```

---

## Task 2: Types + API Client + Cron Utility

**Files:**
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/utils/cron.ts`

- [ ] **Step 1: Create `frontend/src/lib/types.ts`**

```typescript
export type PluginStatus = 'active' | 'inactive' | 'error'
export type ExecutionStatus = 'running' | 'success' | 'failed'
export type TriggerType = 'manual' | 'scheduled'

export interface ConfigSchemaItem {
  key: string
  label: string
  type: string
  secret?: boolean
  required?: boolean
}

export interface Plugin {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  category: string
  version: string
  entryFile: string
  status: PluginStatus
  config: Record<string, unknown>
  configSchema: ConfigSchemaItem[]
  lastRunAt: string | null
  lastRunStatus: string | null
  createdAt: string
  updatedAt: string
}

export interface PluginExecution {
  id: string
  pluginId: string
  plugin?: Plugin
  status: ExecutionStatus
  output: string | null
  error: string | null
  triggeredBy: TriggerType
  durationMs: number | null
  startedAt: string
  finishedAt: string | null
}

export interface ScheduledJob {
  id: string
  pluginId: string
  name: string
  cron: string
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  createdAt: string
}

export interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface DashboardStats {
  totalPlugins: number
  activePlugins: number
  errorPlugins: number
  activeSchedules: number
  totalSchedules: number
  n8nWorkflows: number
  recentSuccessRuns: number
  recentFailedRuns: number
}

export interface DashboardData {
  stats: DashboardStats
  recentActivity: PluginExecution[]
  upcomingSchedules: ScheduledJob[]
  n8nWorkflows: N8nWorkflow[]
  plugins: Plugin[]
}

export interface CalendarData {
  schedules: ScheduledJob[]
  n8nWorkflows: N8nWorkflow[]
}

export interface HealthData {
  status: string
  version: string
  nodeVersion: string
  timezone: string
  pluginDir: string
  telegramConfigured: boolean
  n8nConfigured: boolean
}
```

- [ ] **Step 2: Create `frontend/src/lib/api.ts`**

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('autohub_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('autohub_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api
```

- [ ] **Step 3: Create `frontend/src/lib/utils/cron.ts`**

```typescript
export function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return `Custom schedule (${cron})`
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const pad = (n: string) => n.padStart(2, '0')
  const toTime = (h: string, m: string) => {
    const hNum = parseInt(h)
    const period = hNum >= 12 ? 'PM' : 'AM'
    const h12 = hNum % 12 || 12
    return `${h12}:${pad(m)} ${period}`
  }

  // Every minute
  if (cron === '* * * * *') return 'Every minute'

  // Every hour: 0 * * * *
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && dayOfWeek === '*')
    return 'Every hour'

  // Every N minutes: */N * * * *
  const everyNMin = minute.match(/^\*\/(\d+)$/)
  if (everyNMin && hour === '*' && dayOfMonth === '*' && dayOfWeek === '*')
    return `Every ${everyNMin[1]} minutes`

  // Every N hours: 0 */N * * *
  const everyNHour = hour.match(/^\*\/(\d+)$/)
  if (minute === '0' && everyNHour && dayOfMonth === '*' && dayOfWeek === '*')
    return `Every ${everyNHour[1]} hours`

  // Weekdays: 0 9 * * 1-5
  if (dayOfMonth === '*' && dayOfWeek === '1-5' && !minute.includes('*') && !hour.includes('*'))
    return `Weekdays at ${toTime(hour, minute)}`

  // Specific weekday: 0 9 * * 1
  const weekdayNum = parseInt(dayOfWeek)
  if (
    dayOfMonth === '*' &&
    !isNaN(weekdayNum) &&
    weekdayNum >= 0 &&
    weekdayNum <= 6 &&
    !minute.includes('*') &&
    !hour.includes('*')
  )
    return `Every ${days[weekdayNum]} at ${toTime(hour, minute)}`

  // Day of month: 0 9 1 * *
  const domNum = parseInt(dayOfMonth)
  if (
    !isNaN(domNum) &&
    dayOfWeek === '*' &&
    !minute.includes('*') &&
    !hour.includes('*')
  ) {
    const suffix = domNum === 1 ? 'st' : domNum === 2 ? 'nd' : domNum === 3 ? 'rd' : 'th'
    return `On the ${domNum}${suffix} of every month at ${toTime(hour, minute)}`
  }

  // Every day: 0 9 * * *
  if (dayOfMonth === '*' && dayOfWeek === '*' && !minute.includes('*') && !hour.includes('*'))
    return `Every day at ${toTime(hour, minute)}`

  return `Custom schedule (${cron})`
}

export function cronMatchesDay(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return true // unknown → assume recurring

  const [, hour, dayOfMonth, , dayOfWeek] = parts
  const d = date.getDate()
  const dow = date.getDay() // 0=Sun

  // Every minute / every hour / every N minutes → show on all days
  if (hour === '*') return true

  // Specific day of month
  const domNum = parseInt(dayOfMonth)
  if (!isNaN(domNum) && dayOfMonth !== '*') return d === domNum

  // Weekday range 1-5
  if (dayOfWeek === '1-5') return dow >= 1 && dow <= 5

  // Specific weekday
  const dowNum = parseInt(dayOfWeek)
  if (!isNaN(dowNum) && dayOfWeek !== '*') return dow === dowNum

  // Every day (* * *)
  return true
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/
git commit -m "feat: add API client, shared types, and cron utility"
```

---

## Task 3: React Query Hooks

**Files:**
- Create: `frontend/src/lib/hooks/useDashboard.ts`
- Create: `frontend/src/lib/hooks/usePlugins.ts`
- Create: `frontend/src/lib/hooks/useSchedules.ts`
- Create: `frontend/src/lib/hooks/useN8nWorkflows.ts`
- Create: `frontend/src/lib/hooks/useHealth.ts`

- [ ] **Step 1: Create `frontend/src/lib/hooks/useDashboard.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { DashboardData } from '@/lib/types'

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard')
      return data
    },
    refetchInterval: 30_000,
  })
}
```

- [ ] **Step 2: Create `frontend/src/lib/hooks/usePlugins.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Plugin, PluginExecution } from '@/lib/types'

export function usePlugins() {
  return useQuery<Plugin[]>({
    queryKey: ['plugins'],
    queryFn: async () => {
      const { data } = await api.get('/api/plugins')
      return data
    },
  })
}

export function usePlugin(id: string) {
  return useQuery<Plugin>({
    queryKey: ['plugins', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/plugins/${id}`)
      return data
    },
    enabled: !!id,
  })
}

export function useExecutions(pluginId: string) {
  return useQuery<PluginExecution[]>({
    queryKey: ['executions', pluginId],
    queryFn: async () => {
      const { data } = await api.get(`/api/plugins/${pluginId}/executions`)
      return data
    },
    enabled: !!pluginId,
  })
}

export function useRunPlugin() {
  const queryClient = useQueryClient()
  return useMutation<PluginExecution, Error, string>({
    mutationFn: async (pluginId: string) => {
      const { data } = await api.post(`/api/plugins/${pluginId}/run`)
      return data
    },
    onSuccess: (_, pluginId) => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['executions', pluginId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useTogglePlugin() {
  const queryClient = useQueryClient()
  return useMutation<Plugin, Error, string>({
    mutationFn: async (pluginId: string) => {
      const { data } = await api.post(`/api/plugins/${pluginId}/toggle`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdatePluginConfig() {
  const queryClient = useQueryClient()
  return useMutation<Plugin, Error, { id: string; config: Record<string, unknown> }>({
    mutationFn: async ({ id, config }) => {
      const { data } = await api.patch(`/api/plugins/${id}/config`, { config })
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['plugins', id] })
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })
}
```

- [ ] **Step 3: Create `frontend/src/lib/hooks/useSchedules.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ScheduledJob } from '@/lib/types'

export function useSchedules() {
  return useQuery<ScheduledJob[]>({
    queryKey: ['schedules'],
    queryFn: async () => {
      const { data } = await api.get('/api/schedules')
      return data
    },
  })
}

export function useCreateSchedule() {
  const queryClient = useQueryClient()
  return useMutation<
    ScheduledJob,
    Error,
    { pluginId: string; name: string; cron: string }
  >({
    mutationFn: async (payload) => {
      const { data } = await api.post('/api/schedules', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.delete(`/api/schedules/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useToggleSchedule() {
  const queryClient = useQueryClient()
  return useMutation<ScheduledJob, Error, string>({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/api/schedules/${id}/toggle`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
```

- [ ] **Step 4: Create `frontend/src/lib/hooks/useN8nWorkflows.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { N8nWorkflow } from '@/lib/types'

export function useN8nWorkflows() {
  return useQuery<N8nWorkflow[]>({
    queryKey: ['n8n-workflows'],
    queryFn: async () => {
      const { data } = await api.get('/api/n8n/workflows')
      return data?.data ?? data ?? []
    },
    retry: false,
  })
}

export function useActivateWorkflow() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.post(`/api/n8n/workflows/${id}/activate`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['n8n-workflows'] }),
  })
}

export function useDeactivateWorkflow() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.post(`/api/n8n/workflows/${id}/deactivate`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['n8n-workflows'] }),
  })
}
```

- [ ] **Step 5: Create `frontend/src/lib/hooks/useHealth.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { HealthData } from '@/lib/types'

export function useHealth() {
  return useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await api.get('/api/health')
      return data
    },
  })
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/hooks/
git commit -m "feat: add React Query hooks for all API endpoints"
```

---

## Task 4: UI Components

**Files:**
- Create: `frontend/src/components/ui/Toast.tsx`
- Create: `frontend/src/components/ui/Modal.tsx`
- Create: `frontend/src/components/ui/StatCard.tsx`
- Create: `frontend/src/components/ui/StatusBadge.tsx`

- [ ] **Step 1: Create `frontend/src/components/ui/Toast.tsx`**

```tsx
'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const add = useCallback((message: string, type: ToastType) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const value: ToastContextValue = {
    success: (msg) => add(msg, 'success'),
    error: (msg) => add(msg, 'error'),
    info: (msg) => add(msg, 'info'),
  }

  const styles: Record<ToastType, string> = {
    success: 'border-[#22c55e] text-[#22c55e]',
    error: 'border-[#ef4444] text-[#ef4444]',
    info: 'border-[#3b82f6] text-[#3b82f6]',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 flex flex-col gap-2 z-50"
        aria-live="polite"
        data-testid="toast-container"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="alert"
            className={`bg-[#1a1a1a] border rounded-md px-4 py-3 text-sm min-w-[260px] ${styles[toast.type]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
```

- [ ] **Step 2: Create `frontend/src/components/ui/Modal.tsx`**

```tsx
'use client'
import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg w-full max-w-md mx-4 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#6b7280] hover:text-[#f1f1f1] transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/ui/StatCard.tsx`**

```tsx
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  accent?: 'red' | 'green' | 'blue'
}

const accentStyles = {
  red: 'border-[#ef4444]/40 bg-[#ef4444]/5',
  green: 'border-[#22c55e]/40 bg-[#22c55e]/5',
  blue: 'border-[#3b82f6]/40 bg-[#3b82f6]/5',
}

const iconStyles = {
  red: 'text-[#ef4444]',
  green: 'text-[#22c55e]',
  blue: 'text-[#3b82f6]',
}

export default function StatCard({ label, value, icon: Icon, accent }: StatCardProps) {
  return (
    <div
      className={`bg-[#1a1a1a] border rounded-lg p-4 flex items-center gap-4 ${
        accent ? accentStyles[accent] : 'border-[#2a2a2a]'
      }`}
      data-testid="stat-card"
    >
      <div
        className={`p-2 rounded-md bg-[#111111] ${
          accent ? iconStyles[accent] : 'text-[#3b82f6]'
        }`}
      >
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[#9ca3af] text-xs uppercase tracking-wide">{label}</p>
        <p className="text-white text-2xl font-semibold leading-tight">{value}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/ui/StatusBadge.tsx`**

```tsx
type BadgeStatus = 'success' | 'failed' | 'running' | 'active' | 'inactive' | 'error'

interface StatusBadgeProps {
  status: BadgeStatus
}

const styles: Record<BadgeStatus, string> = {
  success: 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30',
  active: 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30',
  failed: 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30',
  error: 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30',
  running: 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30',
  inactive: 'bg-[#6b7280]/10 text-[#6b7280] border border-[#6b7280]/30',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
      data-testid={`status-badge-${status}`}
    >
      {status}
    </span>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat: add UI components (Toast, Modal, StatCard, StatusBadge)"
```

---

## Task 5: Layout Components

**Files:**
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/app/providers.tsx`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `frontend/src/components/layout/Sidebar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Puzzle, Clock, Calendar,
  GitBranch, Settings, LogOut,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Plugins', icon: Puzzle },
  { href: '/schedules', label: 'Schedules', icon: Clock },
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
    localStorage.removeItem('autohub_token')
    router.replace('/login')
  }

  return (
    <aside className="w-56 bg-[#111111] border-r border-[#2a2a2a] flex flex-col h-screen sticky top-0 shrink-0">
      <div className="p-4 border-b border-[#2a2a2a]">
        <span className="text-white font-medium text-sm">⚡ AutoHub</span>
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

- [ ] **Step 2: Create `frontend/src/components/layout/AppShell.tsx`**

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('autohub_token')
    if (!token) {
      router.replace('/login')
    }
  }, [router])

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 min-w-0">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/src/app/providers.tsx`**

```tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 10_000 },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 4: Replace `frontend/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'AutoHub',
  description: 'Personal automation OS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Create `frontend/src/app/(app)/layout.tsx`**

```tsx
import AppShell from '@/components/layout/AppShell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/ frontend/src/app/providers.tsx frontend/src/app/layout.tsx frontend/src/app/'(app)'/layout.tsx
git commit -m "feat: add AppShell, Sidebar, root layout, and QueryClient provider"
```

---

## Task 6: Plugin Components

**Files:**
- Create: `frontend/src/components/plugins/ConfigModal.tsx`
- Create: `frontend/src/components/plugins/ScheduleModal.tsx`
- Create: `frontend/src/components/plugins/PluginCard.tsx`

- [ ] **Step 1: Create `frontend/src/components/plugins/ConfigModal.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useUpdatePluginConfig } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import type { Plugin } from '@/lib/types'

interface ConfigModalProps {
  plugin: Plugin
  isOpen: boolean
  onClose: () => void
}

export default function ConfigModal({ plugin, isOpen, onClose }: ConfigModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      plugin.configSchema.map(item => [
        item.key,
        String(plugin.config[item.key] ?? ''),
      ]),
    ),
  )
  const updateConfig = useUpdatePluginConfig()
  const toast = useToast()

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({ id: plugin.id, config: values })
      toast.success('Configuration saved')
      onClose()
    } catch {
      toast.error('Failed to save configuration')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Configure ${plugin.name}`}>
      <div className="space-y-4">
        {plugin.configSchema.map(item => (
          <div key={item.key}>
            <label className="block text-sm text-[#9ca3af] mb-1">
              {item.label}
              {item.required && <span className="text-[#ef4444] ml-1">*</span>}
            </label>
            <input
              type={item.secret ? 'password' : 'text'}
              value={values[item.key] ?? ''}
              onChange={e => setValues(prev => ({ ...prev, [item.key]: e.target.value }))}
              placeholder={item.secret ? '••••••••' : item.label}
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-[#f1f1f1] focus:outline-none focus:border-[#3b82f6]"
              data-testid={`config-input-${item.key}`}
            />
          </div>
        ))}
        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#9ca3af] hover:text-[#f1f1f1] rounded-md border border-[#2a2a2a] hover:border-[#3b82f6] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
          >
            {updateConfig.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/plugins/ScheduleModal.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useCreateSchedule } from '@/lib/hooks/useSchedules'
import { useToast } from '@/components/ui/Toast'
import { cronToHuman } from '@/lib/utils/cron'
import type { Plugin } from '@/lib/types'

interface ScheduleModalProps {
  plugin: Plugin
  isOpen: boolean
  onClose: () => void
}

const PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every day at 9am', cron: '0 9 * * *' },
  { label: 'Every Monday at 9am', cron: '0 9 * * 1' },
  { label: 'Weekdays at 9am', cron: '0 9 * * 1-5' },
  { label: 'Custom', cron: '' },
]

export default function ScheduleModal({ plugin, isOpen, onClose }: ScheduleModalProps) {
  const [name, setName] = useState(`${plugin.name} schedule`)
  const [cron, setCron] = useState('0 9 * * *')
  const [isCustom, setIsCustom] = useState(false)
  const createSchedule = useCreateSchedule()
  const toast = useToast()

  const handlePreset = (presetCron: string) => {
    if (presetCron === '') {
      setIsCustom(true)
    } else {
      setIsCustom(false)
      setCron(presetCron)
    }
  }

  const handleSave = async () => {
    if (!cron.trim()) {
      toast.error('Please enter a cron expression')
      return
    }
    try {
      await createSchedule.mutateAsync({ pluginId: plugin.id, name, cron })
      toast.success('Schedule created')
      onClose()
    } catch {
      toast.error('Failed to create schedule')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Schedule ${plugin.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-[#9ca3af] mb-1">Schedule name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-[#f1f1f1] focus:outline-none focus:border-[#3b82f6]"
          />
        </div>

        <div>
          <label className="block text-sm text-[#9ca3af] mb-2">Frequency</label>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset.cron)}
                className={`px-3 py-2 text-xs rounded-md border transition-colors text-left ${
                  (!isCustom && cron === preset.cron) || (isCustom && preset.cron === '')
                    ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6]'
                    : 'border-[#2a2a2a] text-[#9ca3af] hover:border-[#3b82f6]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {isCustom && (
          <div>
            <label className="block text-sm text-[#9ca3af] mb-1">Cron expression</label>
            <input
              type="text"
              value={cron}
              onChange={e => setCron(e.target.value)}
              placeholder="0 9 * * *"
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm font-mono text-[#f1f1f1] focus:outline-none focus:border-[#3b82f6]"
              data-testid="cron-input"
            />
          </div>
        )}

        {cron && (
          <p className="text-xs text-[#6b7280]">
            Preview:{' '}
            <span className="text-[#9ca3af]">{cronToHuman(cron)}</span>
          </p>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#9ca3af] hover:text-[#f1f1f1] rounded-md border border-[#2a2a2a] hover:border-[#3b82f6] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={createSchedule.isPending}
            className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
          >
            {createSchedule.isPending ? 'Saving…' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/plugins/PluginCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Play, Settings2, Clock, Power } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import ConfigModal from './ConfigModal'
import ScheduleModal from './ScheduleModal'
import { useRunPlugin, useTogglePlugin } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import { formatDistanceToNow } from 'date-fns'
import type { Plugin } from '@/lib/types'

const categoryColors: Record<string, string> = {
  productivity: 'bg-[#3b82f6]/10 text-[#3b82f6]',
  ops: 'bg-[#8b5cf6]/10 text-[#8b5cf6]',
  utility: 'bg-[#6b7280]/10 text-[#9ca3af]',
  marketing: 'bg-[#f59e0b]/10 text-[#f59e0b]',
  finance: 'bg-[#22c55e]/10 text-[#22c55e]',
}

export default function PluginCard({ plugin }: { plugin: Plugin }) {
  const [configOpen, setConfigOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const runPlugin = useRunPlugin()
  const togglePlugin = useTogglePlugin()
  const toast = useToast()

  const handleRun = async () => {
    try {
      const result = await runPlugin.mutateAsync(plugin.id)
      if (result.status === 'success') {
        toast.success(`${plugin.name} ran successfully`)
      } else if (result.status === 'failed') {
        toast.error(`${plugin.name} failed: ${result.error ?? 'Unknown error'}`)
      } else {
        toast.info(`${plugin.name} is running`)
      }
    } catch {
      toast.error(`Failed to run ${plugin.name}`)
    }
  }

  const handleToggle = async () => {
    try {
      await togglePlugin.mutateAsync(plugin.id)
    } catch {
      toast.error('Failed to toggle plugin')
    }
  }

  const categoryStyle = categoryColors[plugin.category] ?? categoryColors.utility

  return (
    <>
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex flex-col gap-3 hover:border-[#3b82f6]/40 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label={plugin.name}>
              {plugin.icon}
            </span>
            <div>
              <h3 className="text-white font-medium text-sm">{plugin.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryStyle}`}>
                {plugin.category}
              </span>
            </div>
          </div>
          <StatusBadge status={plugin.status} />
        </div>

        <p className="text-[#6b7280] text-xs leading-relaxed line-clamp-2">
          {plugin.description || 'No description.'}
        </p>

        <div className="text-xs text-[#6b7280]">
          {plugin.lastRunAt ? (
            <span>
              Last run:{' '}
              <span className={plugin.lastRunStatus === 'failed' ? 'text-[#ef4444]' : 'text-[#9ca3af]'}>
                {formatDistanceToNow(new Date(plugin.lastRunAt), { addSuffix: true })}
              </span>
            </span>
          ) : (
            <span>Never run</span>
          )}
        </div>

        <div className="flex gap-2 flex-wrap pt-1 border-t border-[#2a2a2a]">
          <button
            onClick={handleRun}
            disabled={runPlugin.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
            data-testid={`run-plugin-${plugin.id}`}
          >
            <Play size={12} />
            {runPlugin.isPending ? 'Running…' : 'Run now'}
          </button>

          {plugin.configSchema.length > 0 && (
            <button
              onClick={() => setConfigOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-md hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors"
            >
              <Settings2 size={12} />
              Configure
            </button>
          )}

          <button
            onClick={() => setScheduleOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-md hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors"
          >
            <Clock size={12} />
            Schedule
          </button>

          <button
            onClick={handleToggle}
            disabled={togglePlugin.isPending}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md transition-colors ml-auto disabled:opacity-50 ${
              plugin.status === 'active'
                ? 'border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10'
                : 'border-[#2a2a2a] text-[#6b7280] hover:border-[#3b82f6] hover:text-[#f1f1f1]'
            }`}
            data-testid={`toggle-plugin-${plugin.id}`}
          >
            <Power size={12} />
            {plugin.status === 'active' ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {configOpen && (
        <ConfigModal plugin={plugin} isOpen={configOpen} onClose={() => setConfigOpen(false)} />
      )}
      {scheduleOpen && (
        <ScheduleModal plugin={plugin} isOpen={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      )}
    </>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/plugins/
git commit -m "feat: add plugin components (PluginCard, ConfigModal, ScheduleModal)"
```

---

## Task 7: Login Page

**Files:**
- Create: `frontend/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/(auth)/login/page.tsx`**

```tsx
'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/login', { password })
      localStorage.setItem('autohub_token', data.access_token)
      router.replace('/')
    } catch {
      setError('Invalid password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8">
          <div className="text-center mb-8">
            <span className="text-3xl">⚡</span>
            <h1 className="text-white font-semibold text-xl mt-2">AutoHub</h1>
            <p className="text-[#6b7280] text-sm mt-1">Personal Automation OS</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm text-[#9ca3af] mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[#f1f1f1] text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
            </div>

            {error && (
              <p className="text-[#ef4444] text-sm" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3b82f6] text-white py-2 rounded-md text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Logging in…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(auth)'/
git commit -m "feat: add login page (JWT auth, localStorage token storage)"
```

---

## Task 8: Dashboard Page

**Files:**
- Create: `frontend/src/app/(app)/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/page.tsx`**

```tsx
'use client'
import { LayoutDashboard, Puzzle, GitBranch, AlertCircle, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import StatCard from '@/components/ui/StatCard'
import StatusBadge from '@/components/ui/StatusBadge'
import { useDashboard } from '@/lib/hooks/useDashboard'
import { useToggleSchedule } from '@/lib/hooks/useSchedules'
import { useActivateWorkflow, useDeactivateWorkflow } from '@/lib/hooks/useN8nWorkflows'

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard()
  const toggleSchedule = useToggleSchedule()
  const activateWorkflow = useActivateWorkflow()
  const deactivateWorkflow = useDeactivateWorkflow()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280] text-sm">Loading dashboard…</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-[#ef4444] text-sm p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg">
        Failed to load dashboard. Is the backend running?
      </div>
    )
  }

  const { stats, recentActivity, upcomingSchedules, n8nWorkflows } = data

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-white text-xl font-semibold flex items-center gap-2">
          <LayoutDashboard size={20} className="text-[#3b82f6]" />
          Dashboard
        </h1>
        <p className="text-[#6b7280] text-sm mt-1">Overview of your automations</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Plugins" value={stats.totalPlugins} icon={Puzzle} />
        <StatCard label="Active Schedules" value={stats.activeSchedules} icon={Clock} />
        <StatCard label="n8n Workflows" value={stats.n8nWorkflows} icon={GitBranch} />
        <StatCard
          label="Failed Runs (24h)"
          value={stats.recentFailedRuns}
          icon={AlertCircle}
          accent={stats.recentFailedRuns > 0 ? 'red' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2">
          <h2 className="text-white font-medium text-sm mb-3">Recent Activity</h2>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg divide-y divide-[#2a2a2a]">
            {recentActivity.length === 0 ? (
              <p className="text-[#6b7280] text-sm p-4">No recent activity.</p>
            ) : (
              recentActivity.map(exec => (
                <div key={exec.id} className="flex items-center justify-between p-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[#f1f1f1] text-sm truncate">
                      {exec.plugin?.name ?? exec.pluginId}
                    </p>
                    <p className="text-[#6b7280] text-xs">
                      {exec.triggeredBy} ·{' '}
                      {formatDistanceToNow(new Date(exec.startedAt), { addSuffix: true })}
                      {exec.durationMs != null && ` · ${exec.durationMs}ms`}
                    </p>
                  </div>
                  <StatusBadge status={exec.status} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming schedules */}
        <div>
          <h2 className="text-white font-medium text-sm mb-3">Upcoming Schedules</h2>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg divide-y divide-[#2a2a2a]">
            {upcomingSchedules.length === 0 ? (
              <p className="text-[#6b7280] text-sm p-4">No schedules configured.</p>
            ) : (
              upcomingSchedules.map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between p-3 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[#f1f1f1] text-sm truncate">{schedule.name}</p>
                    <p className="text-[#6b7280] text-xs font-mono">{schedule.cron}</p>
                  </div>
                  <button
                    onClick={() => toggleSchedule.mutate(schedule.id)}
                    className={`text-xs px-2 py-1 rounded border shrink-0 transition-colors ${
                      schedule.enabled
                        ? 'border-[#22c55e]/40 text-[#22c55e]'
                        : 'border-[#2a2a2a] text-[#6b7280]'
                    }`}
                  >
                    {schedule.enabled ? 'On' : 'Off'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* n8n workflow strip */}
      {n8nWorkflows.length > 0 && (
        <div>
          <h2 className="text-white font-medium text-sm mb-3">n8n Workflows</h2>
          <div className="flex gap-3 flex-wrap">
            {n8nWorkflows.map((wf) => (
              <div
                key={wf.id}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 flex items-center gap-3 min-w-[200px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[#f1f1f1] text-sm truncate">{wf.name}</p>
                  <StatusBadge status={wf.active ? 'active' : 'inactive'} />
                </div>
                <button
                  onClick={() =>
                    wf.active
                      ? deactivateWorkflow.mutate(wf.id)
                      : activateWorkflow.mutate(wf.id)
                  }
                  className="text-xs px-2 py-1 rounded border border-[#2a2a2a] text-[#9ca3af] hover:border-[#3b82f6] shrink-0 transition-colors"
                >
                  {wf.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(app)'/page.tsx
git commit -m "feat: add dashboard page (stats, activity feed, schedules, n8n strip)"
```

---

## Task 9: Plugins Page

**Files:**
- Create: `frontend/src/app/(app)/plugins/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/plugins/page.tsx`**

```tsx
'use client'
import { Puzzle } from 'lucide-react'
import PluginCard from '@/components/plugins/PluginCard'
import { usePlugins } from '@/lib/hooks/usePlugins'

export default function PluginsPage() {
  const { data: plugins, isLoading, error } = usePlugins()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280] text-sm">Loading plugins…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-[#ef4444] text-sm p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg">
        Failed to load plugins.
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <h1 className="text-white text-xl font-semibold flex items-center gap-2">
          <Puzzle size={20} className="text-[#3b82f6]" />
          Plugins
        </h1>
        {plugins && (
          <span className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30 px-2 py-0.5 rounded-full">
            {plugins.length}
          </span>
        )}
      </div>

      {!plugins || plugins.length === 0 ? (
        <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
          No plugins installed. Drop a plugin folder into the PLUGIN_DIR volume and restart the backend.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plugins.map(plugin => (
            <PluginCard key={plugin.id} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(app)'/plugins/
git commit -m "feat: add plugins page (3-col grid, run/configure/schedule/toggle)"
```

---

## Task 10: Schedules Page

**Files:**
- Create: `frontend/src/app/(app)/schedules/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/schedules/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Clock, Plus, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useSchedules, useDeleteSchedule, useToggleSchedule } from '@/lib/hooks/useSchedules'
import { usePlugins } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import ScheduleModal from '@/components/plugins/ScheduleModal'
import { cronToHuman } from '@/lib/utils/cron'
import type { Plugin } from '@/lib/types'

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

export default function SchedulesPage() {
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
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-xl font-semibold flex items-center gap-2">
          <Clock size={20} className="text-[#3b82f6]" />
          Schedules
        </h1>
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
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-x-auto">
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(app)'/schedules/
git commit -m "feat: add schedules page (table, inline toggle, delete confirm)"
```

---

## Task 11: Calendar Page

**Files:**
- Create: `frontend/src/app/(app)/calendar/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/calendar/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isToday, format, addMonths, subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { cronMatchesDay, cronToHuman } from '@/lib/utils/cron'
import type { CalendarData, ScheduledJob, N8nWorkflow } from '@/lib/types'

function useCalendar() {
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
            <p key={s.id} className="text-xs text-[#f1f1f1] truncate">
              • {s.name} <span className="text-[#6b7280]">({cronToHuman(s.cron)})</span>
            </p>
          ))}
        </div>
      )}
      {dayWorkflows.length > 0 && (
        <div>
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">n8n</p>
          {dayWorkflows.map(w => (
            <p key={w.id} className="text-xs text-[#a78bfa] truncate">• {w.name}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null)
  const { data, isLoading } = useCalendar()

  const schedules: ScheduledJob[] = data?.schedules ?? []
  const n8nWorkflows: N8nWorkflow[] = data?.n8nWorkflows ?? []

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const firstDayOffset = getDay(startOfMonth(currentMonth))

  const hasDots = (date: Date) => ({
    blue: schedules.some(s => s.enabled && cronMatchesDay(s.cron, date)),
    purple: n8nWorkflows.some(w => w.active),
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

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
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
          {/* Empty cells for first week offset */}
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="border-b border-r border-[#2a2a2a] h-20" />
          ))}

          {days.map(day => {
            const dots = hasDots(day)
            const isHovered = hoveredDay && isSameDay(hoveredDay, day)
            return (
              <div
                key={day.toISOString()}
                className="relative border-b border-r border-[#2a2a2a] h-20 p-2 cursor-pointer hover:bg-[#111111] transition-colors"
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
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
                {isHovered && (
                  <DayPopover
                    date={day}
                    schedules={schedules}
                    n8nWorkflows={n8nWorkflows}
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(app)'/calendar/
git commit -m "feat: add calendar page (month view, cron dots, day popover)"
```

---

## Task 12: n8n Workflows Page

**Files:**
- Create: `frontend/src/app/(app)/n8n-workflows/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/n8n-workflows/page.tsx`**

```tsx
'use client'
import { GitBranch, ExternalLink, Info } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import {
  useN8nWorkflows,
  useActivateWorkflow,
  useDeactivateWorkflow,
} from '@/lib/hooks/useN8nWorkflows'
import { useToast } from '@/components/ui/Toast'

export default function N8nWorkflowsPage() {
  const { data: workflows, isLoading, error } = useN8nWorkflows()
  const activate = useActivateWorkflow()
  const deactivate = useDeactivateWorkflow()
  const toast = useToast()

  const isN8nKeyError =
    error &&
    (error as any)?.response?.status === 503

  const handleToggle = async (id: string, active: boolean) => {
    try {
      if (active) {
        await deactivate.mutateAsync(id)
        toast.success('Workflow deactivated')
      } else {
        await activate.mutateAsync(id)
        toast.success('Workflow activated')
      }
    } catch {
      toast.error('Failed to update workflow')
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <GitBranch size={20} className="text-[#3b82f6]" />
        n8n Workflows
      </h1>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-lg">
        <Info size={16} className="text-[#3b82f6] mt-0.5 shrink-0" />
        <p className="text-[#9ca3af] text-sm">
          n8n is fully accessible at{' '}
          <a href="/n8n" target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:underline">
            /n8n
          </a>
          . Use this page to manage which workflows are active and monitor them from your dashboard.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <div className="text-[#6b7280] text-sm">Loading workflows…</div>
        </div>
      )}

      {isN8nKeyError && (
        <div className="p-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg space-y-3">
          <p className="text-[#f59e0b] font-medium text-sm">n8n API key not configured</p>
          <ol className="text-[#9ca3af] text-sm space-y-1 list-decimal list-inside">
            <li>
              Open n8n at{' '}
              <a href="/n8n" target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:underline">
                /n8n
              </a>
            </li>
            <li>Go to Settings → API → Create API Key</li>
            <li>
              Add it to your <code className="text-[#f1f1f1]">.env</code> file as{' '}
              <code className="text-[#f1f1f1]">N8N_API_KEY=your-key</code>
            </li>
            <li>
              Restart the backend: <code className="text-[#f1f1f1]">docker compose restart backend</code>
            </li>
          </ol>
        </div>
      )}

      {!isLoading && !error && (!workflows || workflows.length === 0) && (
        <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
          No workflows found. Create one in the{' '}
          <a href="/n8n" className="text-[#3b82f6] hover:underline">
            n8n editor
          </a>
          .
        </div>
      )}

      {workflows && workflows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map(wf => (
            <div
              key={wf.id}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3 hover:border-[#3b82f6]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-white font-medium text-sm leading-tight">{wf.name}</h3>
                <StatusBadge status={wf.active ? 'active' : 'inactive'} />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleToggle(wf.id, wf.active)}
                  disabled={activate.isPending || deactivate.isPending}
                  className="flex-1 text-xs py-1.5 rounded-md border border-[#2a2a2a] text-[#9ca3af] hover:border-[#3b82f6] hover:text-[#f1f1f1] disabled:opacity-50 transition-colors"
                >
                  {wf.active ? 'Deactivate' : 'Activate'}
                </button>
                <a
                  href="/n8n"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-[#2a2a2a] text-[#9ca3af] hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors"
                >
                  <ExternalLink size={11} />
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(app)'/n8n-workflows/
git commit -m "feat: add n8n workflows page (activate/deactivate, setup instructions)"
```

---

## Task 13: Settings Page

**Files:**
- Create: `frontend/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/(app)/settings/page.tsx`**

```tsx
'use client'
import { Settings, ExternalLink } from 'lucide-react'
import { useHealth } from '@/lib/hooks/useHealth'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 space-y-3">
      <h2 className="text-white font-medium text-sm">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm py-1 border-t border-[#2a2a2a] first:border-0">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-[#9ca3af] font-mono text-xs">{value}</span>
    </div>
  )
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
        configured
          ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5'
          : 'border-[#2a2a2a] text-[#6b7280]'
      }`}
    >
      {configured ? 'Configured' : 'Not configured'}
    </span>
  )
}

export default function SettingsPage() {
  const { data: health, isLoading } = useHealth()

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <Settings size={20} className="text-[#3b82f6]" />
        Settings
      </h1>

      {isLoading ? (
        <div className="text-[#6b7280] text-sm">Loading…</div>
      ) : (
        <>
          <Section title="System Info">
            <Row label="App version" value={health?.version ?? '—'} />
            <Row label="Node.js" value={health?.nodeVersion ?? '—'} />
            <Row label="Timezone" value={health?.timezone ?? '—'} />
            <Row label="Plugin directory" value={health?.pluginDir ?? '—'} />
          </Section>

          <Section title="Notifications">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-[#9ca3af]">Telegram bot (autohub-serenedge)</p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env to enable
                </p>
              </div>
              <ConfiguredBadge configured={health?.telegramConfigured ?? false} />
            </div>
          </Section>

          <Section title="Plugin Directory">
            <p className="text-[#9ca3af] text-sm">
              Plugins are loaded from{' '}
              <code className="text-[#f1f1f1] bg-[#111111] px-1.5 py-0.5 rounded text-xs">
                {health?.pluginDir ?? '/app/plugins'}
              </code>
            </p>
            <p className="text-[#6b7280] text-xs">
              Drop a folder with <code>manifest.json</code> and <code>index.js</code> into the
              Docker volume, then restart the backend. The plugin will be auto-registered on startup.
            </p>
          </Section>

          <Section title="n8n">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-[#9ca3af]">n8n API integration</p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  Set N8N_API_KEY in .env after creating an API key in n8n
                </p>
              </div>
              <ConfiguredBadge configured={health?.n8nConfigured ?? false} />
            </div>
            <a
              href="/n8n"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#3b82f6] hover:underline"
            >
              <ExternalLink size={12} />
              Open n8n editor
            </a>
          </Section>

          <Section title="Danger Zone">
            <p className="text-[#9ca3af] text-sm">
              To restart all services, run from the project directory:
            </p>
            <code className="block text-xs text-[#f1f1f1] bg-[#111111] border border-[#2a2a2a] rounded px-3 py-2 font-mono">
              docker compose restart
            </code>
            <p className="text-[#6b7280] text-xs">
              Scheduled jobs automatically re-register on backend startup.
            </p>
          </Section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(app)'/settings/
git commit -m "feat: add settings page (system info, telegram status, n8n status)"
```

---

## Task 14: Frontend Component Tests

**Files:**
- Create: `frontend/src/components/ui/StatusBadge.test.tsx`
- Create: `frontend/src/components/ui/StatCard.test.tsx`
- Create: `frontend/src/components/ui/Toast.test.tsx`
- Create: `frontend/src/components/ui/Modal.test.tsx`
- Create: `frontend/src/components/layout/Sidebar.test.tsx`
- Create: `frontend/src/lib/utils/cron.test.ts`

- [ ] **Step 1: Create `frontend/src/components/ui/StatusBadge.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders "success" text', () => {
    render(<StatusBadge status="success" />)
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('renders "failed" text', () => {
    render(<StatusBadge status="failed" />)
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('renders "running" text', () => {
    render(<StatusBadge status="running" />)
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('applies red color for failed status', () => {
    const { container } = render(<StatusBadge status="failed" />)
    expect(container.firstChild).toHaveClass('text-[#ef4444]')
  })

  it('applies green color for success status', () => {
    const { container } = render(<StatusBadge status="success" />)
    expect(container.firstChild).toHaveClass('text-[#22c55e]')
  })

  it('applies gray color for inactive status', () => {
    const { container } = render(<StatusBadge status="inactive" />)
    expect(container.firstChild).toHaveClass('text-[#6b7280]')
  })
})
```

- [ ] **Step 2: Create `frontend/src/components/ui/StatCard.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from './StatCard'
import { AlertCircle } from 'lucide-react'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Plugins" value={5} icon={AlertCircle} />)
    expect(screen.getByText('Total Plugins')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders with red accent class when accent="red"', () => {
    const { getByTestId } = render(
      <StatCard label="Failures" value={3} icon={AlertCircle} accent="red" />,
    )
    expect(getByTestId('stat-card')).toHaveClass('border-[#ef4444]/40')
  })

  it('renders without accent class when no accent prop', () => {
    const { getByTestId } = render(
      <StatCard label="Plugins" value={0} icon={AlertCircle} />,
    )
    expect(getByTestId('stat-card')).toHaveClass('border-[#2a2a2a]')
  })
})
```

- [ ] **Step 3: Create `frontend/src/components/ui/Toast.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast'

function ToastTrigger({ type }: { type: 'success' | 'error' | 'info' }) {
  const toast = useToast()
  return (
    <button onClick={() => toast[type](`Test ${type} message`)}>
      Show {type}
    </button>
  )
}

describe('Toast', () => {
  it('shows toast on success call', async () => {
    const { getByText } = render(
      <ToastProvider>
        <ToastTrigger type="success" />
      </ToastProvider>,
    )
    act(() => getByText('Show success').click())
    expect(screen.getByText('Test success message')).toBeInTheDocument()
  })

  it('shows toast on error call', async () => {
    const { getByText } = render(
      <ToastProvider>
        <ToastTrigger type="error" />
      </ToastProvider>,
    )
    act(() => getByText('Show error').click())
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('auto-dismisses toast after 4 seconds', async () => {
    vi.useFakeTimers()
    const { getByText } = render(
      <ToastProvider>
        <ToastTrigger type="info" />
      </ToastProvider>,
    )
    act(() => getByText('Show info').click())
    expect(screen.getByText('Test info message')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4100))
    expect(screen.queryByText('Test info message')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 4: Create `frontend/src/components/ui/Modal.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

describe('Modal', () => {
  it('renders children when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>,
    )
    expect(screen.getByText('Modal content')).toBeInTheDocument()
    expect(screen.getByText('Test Modal')).toBeInTheDocument()
  })

  it('renders nothing when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden Modal">
        <p>Hidden content</p>
      </Modal>,
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    )
    await userEvent.click(screen.getByLabelText('Close modal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    )
    await userEvent.click(screen.getByRole('dialog').previousElementSibling!)
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 5: Create `frontend/src/components/layout/Sidebar.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

import Sidebar from './Sidebar'
import { usePathname, useRouter } from 'next/navigation'

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any)
  })

  it('renders AutoHub logo', () => {
    render(<Sidebar />)
    expect(screen.getByText('⚡ AutoHub')).toBeInTheDocument()
  })

  it('renders all navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Plugins')).toBeInTheDocument()
    expect(screen.getByText('Schedules')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('n8n Workflows')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('applies active style to current path link', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<Sidebar />)
    const pluginsLink = screen.getByText('Plugins').closest('a')
    expect(pluginsLink).toHaveClass('text-[#3b82f6]')
  })

  it('clears localStorage and redirects on logout', async () => {
    const mockReplace = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace } as any)
    localStorage.setItem('autohub_token', 'test-token')
    render(<Sidebar />)
    await userEvent.click(screen.getByTestId('logout-button'))
    expect(localStorage.getItem('autohub_token')).toBeNull()
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })
})
```

- [ ] **Step 6: Create `frontend/src/lib/utils/cron.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { cronToHuman, cronMatchesDay } from './cron'

describe('cronToHuman', () => {
  it('converts every minute', () => {
    expect(cronToHuman('* * * * *')).toBe('Every minute')
  })

  it('converts every hour', () => {
    expect(cronToHuman('0 * * * *')).toBe('Every hour')
  })

  it('converts every day at 9am', () => {
    expect(cronToHuman('0 9 * * *')).toBe('Every day at 9:00 AM')
  })

  it('converts every Monday at 9am', () => {
    expect(cronToHuman('0 9 * * 1')).toBe('Every Monday at 9:00 AM')
  })

  it('converts 1st of month at 9am', () => {
    expect(cronToHuman('0 9 1 * *')).toBe('On the 1st of every month at 9:00 AM')
  })

  it('converts weekdays at 9am', () => {
    expect(cronToHuman('0 9 * * 1-5')).toBe('Weekdays at 9:00 AM')
  })

  it('converts every 5 minutes', () => {
    expect(cronToHuman('*/5 * * * *')).toBe('Every 5 minutes')
  })

  it('converts every 6 hours', () => {
    expect(cronToHuman('0 */6 * * *')).toBe('Every 6 hours')
  })

  it('returns custom for unknown patterns', () => {
    expect(cronToHuman('5 4 * * 2,4')).toBe('Custom schedule (5 4 * * 2,4)')
  })
})

describe('cronMatchesDay', () => {
  it('matches every day cron on any day', () => {
    const monday = new Date(2026, 0, 5) // Monday Jan 5 2026
    expect(cronMatchesDay('0 9 * * *', monday)).toBe(true)
  })

  it('matches specific weekday cron', () => {
    const monday = new Date(2026, 0, 5) // Monday
    const tuesday = new Date(2026, 0, 6) // Tuesday
    expect(cronMatchesDay('0 9 * * 1', monday)).toBe(true)
    expect(cronMatchesDay('0 9 * * 1', tuesday)).toBe(false)
  })

  it('matches specific day of month', () => {
    const jan5 = new Date(2026, 0, 5)
    const jan6 = new Date(2026, 0, 6)
    expect(cronMatchesDay('0 9 5 * *', jan5)).toBe(true)
    expect(cronMatchesDay('0 9 5 * *', jan6)).toBe(false)
  })

  it('matches weekdays 1-5 on weekdays', () => {
    const monday = new Date(2026, 0, 5)
    const saturday = new Date(2026, 0, 10)
    expect(cronMatchesDay('0 9 * * 1-5', monday)).toBe(true)
    expect(cronMatchesDay('0 9 * * 1-5', saturday)).toBe(false)
  })
})
```

- [ ] **Step 7: Run all frontend tests**

Run from `frontend/`:
```bash
npm test
```

Expected: All test suites pass. Sample output:
```
✓ src/lib/utils/cron.test.ts (9 tests)
✓ src/components/ui/StatusBadge.test.tsx (6 tests)
✓ src/components/ui/StatCard.test.tsx (3 tests)
✓ src/components/ui/Toast.test.tsx (3 tests)
✓ src/components/ui/Modal.test.tsx (4 tests)
✓ src/components/layout/Sidebar.test.tsx (5 tests)

Test Suites  6 passed
Tests        30 passed
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ui/*.test.tsx frontend/src/components/layout/Sidebar.test.tsx frontend/src/lib/utils/cron.test.ts
git commit -m "feat: add frontend component and utility tests (Vitest + RTL)"
```

---

## Task 15: Build Verification

- [ ] **Step 1: Verify TypeScript compiles**

Run from `frontend/`:
```bash
npm run build
```

Expected: exits 0, `.next/` folder created, no TypeScript errors. Fix any errors before continuing.

- [ ] **Step 2: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "feat: complete AutoHub frontend — all pages, components, and tests"
```

---

## Task 16: Complete `dev-logs/testings.md`

**Files:**
- Modify: `dev-logs/testings.md` (append frontend section)

- [ ] **Step 1: Append frontend test section to `dev-logs/testings.md`**

Add this section at the end of the existing file:

```markdown
---

## Frontend Tests

Run from `frontend/` directory.

```bash
cd frontend
npm install
```

### Run all component + utility tests
```bash
npm test
```
Expected: 6 test suites, ~30 tests, all passing.

### Run with coverage
```bash
npm run test:coverage
```
Expected: Coverage report in `frontend/coverage/`.

### TypeScript build check
```bash
npm run build
```
Expected: exits 0 with no TypeScript errors.

---

## Full Integration Smoke Test (run after `docker compose up --build`)

Run these checks after the full stack is up.

```bash
# 1. Login page loads
curl -s -o /dev/null -w "%{http_code}" http://localhost
# Expected: 200

# 2. Dashboard (requires token)
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"changeme"}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# Expected: JSON with stats.totalPlugins == 3

# 3. Seed plugins present
curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep '"name"'
# Expected: "Daily Summary", "System Health", "Webhook Ping"

# 4. Run daily-summary plugin
PLUGIN_ID=$(curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])")
curl -s -X POST "http://localhost/api/plugins/$PLUGIN_ID/run" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# Expected: {"status":"success","output":"...[=== ... ===]..."}

# 5. Create and verify schedule
curl -s -X POST http://localhost/api/schedules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"pluginId\":\"$PLUGIN_ID\",\"name\":\"Smoke test\",\"cron\":\"0 9 * * *\"}" | python3 -m json.tool
# Expected: {"id":"...","cron":"0 9 * * *","enabled":true}

# 6. n8n bridge returns 503 (API key not set)
curl -s http://localhost/api/n8n/workflows \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"statusCode":503,"message":"N8N_API_KEY not configured"}

# 7. Verify state persists after restart
docker compose down
docker compose up -d
sleep 10
curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'plugins')"
# Expected: 3 plugins
```

### Manual UI Checklist

After running `docker compose up --build`, verify in browser:

- [ ] `http://localhost` redirects to `/login`
- [ ] Login with ADMIN_PASSWORD from .env → redirected to dashboard
- [ ] Dashboard shows 4 stat cards with values
- [ ] Plugins page shows 3 plugin cards (📋 Daily Summary, 🖥️ System Health, 🔔 Webhook Ping)
- [ ] Click "Run now" on Daily Summary → toast appears, card shows last run time
- [ ] Click "Configure" on Webhook Ping → modal opens with URL and Label fields
- [ ] Click "Schedule" on any plugin → modal opens with presets and cron preview
- [ ] Schedules page → table loads, toggle works, delete shows confirmation
- [ ] Calendar page → current month displays, dots appear on days with schedules
- [ ] n8n Workflows page → shows setup instructions (N8N_API_KEY not set)
- [ ] Settings page → shows Node version, plugin dir, Telegram/n8n status badges
- [ ] `/n8n` → n8n UI loads in browser
- [ ] Logout → clears token, redirects to `/login`, protected routes redirect back to login
- [ ] No console errors on any page
```

- [ ] **Step 2: Commit**

```bash
git add dev-logs/testings.md
git commit -m "docs: complete testings.md with frontend tests and full integration checklist"
```
