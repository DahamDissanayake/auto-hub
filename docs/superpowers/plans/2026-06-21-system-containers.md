# System/Containers Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Docker Monitor page to "System/Containers", add live network bandwidth stats (rx/tx Mbps from `/proc/net/dev`) to the system metrics grid, and add an internet speed test button powered by `speedtest-cli`.

**Architecture:** Backend adds `getNetworkStats()` (reads `/proc/net/dev` twice, 500ms apart, same pattern as CPU) and `runSpeedTest()` (shells out to `speedtest-cli --json`) to `DockerService`. Frontend types mirror the new backend shapes. The hook gains speed test state. The page gets two network cards and a speed test button with inline results.

**Tech Stack:** NestJS + TypeScript (backend), Next.js + React + TypeScript (frontend), Tailwind CSS, Lucide icons, Axios

## Global Constraints

- TypeScript strict mode — no untyped `any`
- All `/proc` reads must have try/catch fallbacks returning safe defaults
- `speedtest-cli` must be installed on the Pi: `sudo apt install speedtest-cli`
- URL `/docker` stays unchanged — only labels change
- Follow existing code patterns; no class restructuring
- Backend working directory: `/workspace/auto-hub/backend`
- Frontend working directory: `/workspace/auto-hub/frontend`

---

### Task 1: Backend — Live Network Stats

**Files:**
- Modify: `backend/src/docker/docker.service.ts`

**Interfaces:**
- Produces: `NetworkStats { rxMbps: number, txMbps: number, interfaceName: string }` exported from `docker.service.ts`
- Produces: `SystemMetrics` extended with `network: NetworkStats`
- Consumed by: Task 3 (frontend types mirror these shapes)

- [ ] **Step 1: Add `NetworkStats` interface and update `SystemMetrics`**

In `backend/src/docker/docker.service.ts`, add `NetworkStats` immediately after the `DiskStats` interface and update `SystemMetrics` to include `network`:

```typescript
export interface NetworkStats {
  rxMbps: number
  txMbps: number
  interfaceName: string
}

export interface SystemMetrics {
  cpuPercent: number
  memUsedMb: number
  memTotalMb: number
  memPercent: number
  rootDisk: DiskStats
  dataDisk: DiskStats | null
  network: NetworkStats
}
```

- [ ] **Step 2: Add `parseNetDev()` private helper**

Add this method inside `DockerService`, after `getDiskStats()`:

```typescript
private parseNetDev(raw: string): Record<string, { rxBytes: number; txBytes: number }> {
  const result: Record<string, { rxBytes: number; txBytes: number }> = {}
  for (const line of raw.split('\n').slice(2)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue
    const iface = trimmed.slice(0, colonIdx).trim()
    const fields = trimmed.slice(colonIdx + 1).trim().split(/\s+/)
    result[iface] = {
      rxBytes: parseInt(fields[0] ?? '0', 10),
      txBytes: parseInt(fields[8] ?? '0', 10),
    }
  }
  return result
}
```

- [ ] **Step 3: Add `getNetworkStats()` method**

Add immediately after `parseNetDev()`:

```typescript
private async getNetworkStats(): Promise<NetworkStats> {
  const readDev = (): string => {
    try {
      return fs.readFileSync('/proc/net/dev', 'utf-8')
    } catch {
      return ''
    }
  }
  const s1 = this.parseNetDev(readDev())
  await new Promise<void>((r) => setTimeout(r, 500))
  const s2 = this.parseNetDev(readDev())

  const preferred = ['eth0', 'wlan0']
  const iface =
    preferred.find((p) => s2[p] !== undefined) ??
    Object.keys(s2).find((k) => k !== 'lo') ??
    null

  if (!iface || !s1[iface] || !s2[iface]) {
    return { rxMbps: 0, txMbps: 0, interfaceName: 'unknown' }
  }

  const rxDelta = s2[iface].rxBytes - s1[iface].rxBytes
  const txDelta = s2[iface].txBytes - s1[iface].txBytes

  return {
    rxMbps: parseFloat(Math.max(0, (rxDelta * 8) / 1_000_000 / 0.5).toFixed(2)),
    txMbps: parseFloat(Math.max(0, (txDelta * 8) / 1_000_000 / 0.5).toFixed(2)),
    interfaceName: iface,
  }
}
```

- [ ] **Step 4: Update `getSystemMetrics()` to call `getNetworkStats()` in parallel**

Replace the existing `getSystemMetrics()` method body:

```typescript
async getSystemMetrics(): Promise<SystemMetrics> {
  const [cpuPercent, rootDisk, dataDisk, network] = await Promise.all([
    this.getCpuPercent(),
    this.getDiskStats('/host'),
    this.getDiskStats('/mnt/data'),
    this.getNetworkStats(),
  ])
  const mem = this.getMemInfo()

  return {
    cpuPercent: parseFloat(cpuPercent.toFixed(1)),
    memUsedMb: mem.usedMb,
    memTotalMb: mem.totalMb,
    memPercent: mem.totalMb > 0 ? Math.round((mem.usedMb / mem.totalMb) * 100) : 0,
    rootDisk: rootDisk ?? { path: '/', usedGb: 0, totalGb: 0, freeGb: 0, percent: 0 },
    dataDisk,
    network,
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/docker/docker.service.ts
git commit -m "feat(docker): add live network stats to system metrics"
```

---

### Task 2: Backend — Speed Test Endpoint

**Files:**
- Modify: `backend/src/docker/docker.service.ts`
- Modify: `backend/src/docker/docker.controller.ts`

**Interfaces:**
- Produces: `SpeedTestResult { downloadMbps: number, uploadMbps: number, pingMs: number, server: string }` exported from `docker.service.ts`
- Produces: `POST /api/docker/speed-test` → `SpeedTestResult`
- Consumed by: Task 3 (frontend types), Task 4 (hook)

- [ ] **Step 1: Add `SpeedTestResult` interface to `docker.service.ts`**

Add after the `ContainerInfo` interface:

```typescript
export interface SpeedTestResult {
  downloadMbps: number
  uploadMbps: number
  pingMs: number
  server: string
}
```

- [ ] **Step 2: Add `exec` and `promisify` imports**

Add at the top of `backend/src/docker/docker.service.ts`, after the existing imports:

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
```

- [ ] **Step 3: Add `runSpeedTest()` method to `DockerService`**

Add after `stopAllContainers()`:

```typescript
async runSpeedTest(): Promise<SpeedTestResult> {
  let stdout: string
  try {
    const result = await execAsync('speedtest-cli --json', { timeout: 90_000 })
    stdout = result.stdout
  } catch (err) {
    const msg = String(err)
    if (msg.includes('not found') || msg.includes('ENOENT') || msg.includes('No such file')) {
      throw new Error('speedtest-cli not installed — run: sudo apt install speedtest-cli')
    }
    throw new Error(`Speed test failed: ${msg}`)
  }

  const data = JSON.parse(stdout) as {
    download: number
    upload: number
    ping: number
    server: { sponsor: string; country: string }
  }

  return {
    downloadMbps: parseFloat((data.download / 1_000_000).toFixed(2)),
    uploadMbps: parseFloat((data.upload / 1_000_000).toFixed(2)),
    pingMs: Math.round(data.ping),
    server: `${data.server.sponsor}, ${data.server.country}`,
  }
}
```

- [ ] **Step 4: Add `POST /speed-test` endpoint to `docker.controller.ts`**

Add after the `stopAll()` method:

```typescript
@Post('speed-test')
async speedTest() {
  try {
    return await this.dockerService.runSpeedTest()
  } catch (err) {
    throw new HttpException(
      err instanceof Error ? err.message : String(err),
      HttpStatus.INTERNAL_SERVER_ERROR,
    )
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/docker/docker.service.ts backend/src/docker/docker.controller.ts
git commit -m "feat(docker): add speed test endpoint using speedtest-cli"
```

---

### Task 3: Frontend Types

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Interfaces:**
- Consumes: `NetworkStats`, `SpeedTestResult`, updated `SystemMetrics` shapes from Tasks 1 & 2
- Produces: exported `NetworkStats`, `SpeedTestResult`, updated `SystemMetrics` for Tasks 4 & 5

- [ ] **Step 1: Add `NetworkStats`, `SpeedTestResult`, update `SystemMetrics`**

In `frontend/src/lib/types.ts`, replace the Docker monitor types section (from `// Docker monitor types` to end of file) with:

```typescript
// Docker monitor types
export interface DiskStats {
  path: string
  usedGb: number
  totalGb: number
  freeGb: number
  percent: number
}

export interface NetworkStats {
  rxMbps: number
  txMbps: number
  interfaceName: string
}

export interface SystemMetrics {
  cpuPercent: number
  memUsedMb: number
  memTotalMb: number
  memPercent: number
  rootDisk: DiskStats
  dataDisk: DiskStats | null
  network: NetworkStats
}

export interface ContainerInfo {
  id: string
  shortId: string
  name: string
  image: string
  state: string
  status: string
  health: string | null
  uptime: string
  cpuPercent: number
  memUsageMb: number
  memLimitMb: number
  memPercent: number
}

export interface SpeedTestResult {
  downloadMbps: number
  uploadMbps: number
  pingMs: number
  server: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit
```

Expected: no errors (some errors about `network` missing in existing usage may appear — they will be fixed in Task 5)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(types): add NetworkStats, SpeedTestResult; update SystemMetrics"
```

---

### Task 4: Frontend Hook — Speed Test State

**Files:**
- Modify: `frontend/src/lib/hooks/useDockerMonitor.ts`

**Interfaces:**
- Consumes: `SpeedTestResult` from `../types`
- Produces: `speedTestLoading: boolean`, `speedTestResult: SpeedTestResult | null`, `speedTestError: string | null`, `runSpeedTest: () => Promise<void>` added to hook return value

- [ ] **Step 1: Replace `useDockerMonitor.ts` with updated hook**

```typescript
'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api'
import type { SystemMetrics, ContainerInfo, SpeedTestResult } from '../types'

export function useDockerMonitor() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [containersLoading, setContainersLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [speedTestLoading, setSpeedTestLoading] = useState(false)
  const [speedTestResult, setSpeedTestResult] = useState<SpeedTestResult | null>(null)
  const [speedTestError, setSpeedTestError] = useState<string | null>(null)

  const metricsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containersTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const { data } = await api.get<SystemMetrics>('/api/docker/metrics')
      setMetrics(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics')
    } finally {
      setMetricsLoading(false)
    }
  }, [])

  const fetchContainers = useCallback(async () => {
    try {
      const { data } = await api.get<ContainerInfo[]>('/api/docker/containers')
      setContainers(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load containers')
    } finally {
      setContainersLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMetrics()
    void fetchContainers()

    metricsTimerRef.current = setInterval(() => void fetchMetrics(), 8000)
    containersTimerRef.current = setInterval(() => void fetchContainers(), 10000)

    return () => {
      if (metricsTimerRef.current) clearInterval(metricsTimerRef.current)
      if (containersTimerRef.current) clearInterval(containersTimerRef.current)
    }
  }, [fetchMetrics, fetchContainers])

  const containerAction = useCallback(
    async (id: string, action: 'restart' | 'stop' | 'start') => {
      setActionLoading(`${action}:${id}`)
      try {
        await api.post(`/api/docker/containers/${id}/${action}`)
        await new Promise((r) => setTimeout(r, 1500))
        await fetchContainers()
      } finally {
        setActionLoading(null)
      }
    },
    [fetchContainers],
  )

  const systemAction = useCallback(
    async (action: 'restart-all' | 'stop-all') => {
      setActionLoading(action)
      try {
        await api.post(`/api/docker/system/${action}`)
        await new Promise((r) => setTimeout(r, 2000))
        await fetchContainers()
      } finally {
        setActionLoading(null)
      }
    },
    [fetchContainers],
  )

  const runSpeedTest = useCallback(async () => {
    setSpeedTestLoading(true)
    setSpeedTestError(null)
    try {
      const { data } = await api.post<SpeedTestResult>('/api/docker/speed-test', undefined, {
        timeout: 95_000,
      })
      setSpeedTestResult(data)
    } catch (e) {
      setSpeedTestError(e instanceof Error ? e.message : 'Speed test failed')
    } finally {
      setSpeedTestLoading(false)
    }
  }, [])

  return {
    metrics,
    containers,
    metricsLoading,
    containersLoading,
    error,
    actionLoading,
    speedTestLoading,
    speedTestResult,
    speedTestError,
    refetchContainers: fetchContainers,
    containerAction,
    systemAction,
    runSpeedTest,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/hooks/useDockerMonitor.ts
git commit -m "feat(docker): add speed test state and runSpeedTest to hook"
```

---

### Task 5: Frontend UI

**Files:**
- Modify: `frontend/src/app/(app)/docker/page.tsx`
- Modify: `frontend/src/app/(app)/apps/apps.config.ts`

**Interfaces:**
- Consumes: `speedTestLoading`, `speedTestResult`, `speedTestError`, `runSpeedTest` from `useDockerMonitor`
- Consumes: `metrics.network.rxMbps`, `metrics.network.txMbps`, `metrics.network.interfaceName`
- Consumes: `SpeedTestResult` from `../../../lib/types`

- [ ] **Step 1: Update `apps.config.ts` — rename Docker Monitor entry**

Replace the `docker-monitor` entry in `frontend/src/app/(app)/apps/apps.config.ts`:

```typescript
  {
    id: 'docker-monitor',
    name: 'System/Containers',
    description: 'Real-time system stats (CPU, RAM, disk, network) and container health for the Raspberry Pi.',
    url: '/docker',
    lucideIcon: 'Container',
    color: '#3b82f6',
  },
```

- [ ] **Step 2: Update lucide-react imports in `docker/page.tsx`**

Replace the import block at the top of `frontend/src/app/(app)/docker/page.tsx`:

```typescript
import {
  Container,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  Power,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import { useDockerMonitor } from '../../../lib/hooks/useDockerMonitor'
import type { ContainerInfo, DiskStats, SpeedTestResult } from '../../../lib/types'
import Modal from '../../../components/ui/Modal'
```

- [ ] **Step 3: Make `percent` optional in `MetricCard`**

Replace the `MetricCard` component:

```typescript
function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  percent,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub: string
  percent?: number
  color: string
}) {
  const barColor =
    percent !== undefined && percent > 85
      ? '#ef4444'
      : percent !== undefined && percent > 65
        ? '#f59e0b'
        : color

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[#9ca3af] text-xs">
        <Icon size={14} />
        {label}
      </div>
      <div className="text-white text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[#6b7280] text-xs">{sub}</div>
      {percent !== undefined && (
        <>
          <MiniBar percent={percent} color={barColor} />
          <div className="text-[10px] text-[#6b7280] text-right tabular-nums">{percent}%</div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add `SpeedTestResultBar` component**

Add this component after `DiskCard`:

```typescript
function SpeedTestResultBar({ result }: { result: SpeedTestResult }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-[#9ca3af] mt-2">
      <span className="flex items-center gap-1">
        <Download size={11} className="text-emerald-400" />
        <span className="text-white font-medium tabular-nums">{result.downloadMbps}</span> Mbps
      </span>
      <span className="flex items-center gap-1">
        <Upload size={11} className="text-blue-400" />
        <span className="text-white font-medium tabular-nums">{result.uploadMbps}</span> Mbps
      </span>
      <span className="flex items-center gap-1">
        <RefreshCw size={11} />
        <span className="text-white font-medium tabular-nums">{result.pingMs}</span> ms
      </span>
      <span className="text-[#6b7280]">via {result.server}</span>
    </div>
  )
}
```

- [ ] **Step 5: Replace `DockerMonitorPage` with the full updated component**

Replace the entire `DockerMonitorPage` export:

```typescript
export default function DockerMonitorPage() {
  const {
    metrics,
    containers,
    metricsLoading,
    containersLoading,
    error,
    actionLoading,
    refetchContainers,
    containerAction,
    systemAction,
    speedTestLoading,
    speedTestResult,
    speedTestError,
    runSpeedTest,
  } = useDockerMonitor()

  const [confirmAction, setConfirmAction] = useState<'restart-all' | 'stop-all' | null>(null)

  const running = containers.filter((c) => c.state === 'running').length
  const stopped = containers.filter((c) => c.state !== 'running').length

  const handleSystemAction = (action: 'restart-all' | 'stop-all') => {
    setConfirmAction(action)
  }

  const confirmSystemAction = async () => {
    if (!confirmAction) return
    await systemAction(confirmAction)
    setConfirmAction(null)
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Title ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-white text-xl font-semibold flex items-center gap-2">
          <Container size={20} className="text-[#3b82f6]" />
          System/Containers
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs text-[#6b7280]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-400" />
              {running} running
            </span>
            <span className="flex items-center gap-1.5">
              <AlertCircle size={12} className="text-red-400" />
              {stopped} stopped
            </span>
          </div>
          <button
            onClick={() => void refetchContainers()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white border border-[#2a2a2a] rounded-lg hover:bg-[#1a1a1a] transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── System Metrics ── */}
      <section className="space-y-3">
        <h2 className="text-[#9ca3af] text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
          <Activity size={12} />
          System Metrics
        </h2>
        {metricsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl h-28 animate-pulse" />
            ))}
          </div>
        ) : metrics ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                icon={Cpu}
                label="CPU"
                value={`${metrics.cpuPercent.toFixed(1)}%`}
                sub="utilisation"
                percent={Math.round(metrics.cpuPercent)}
                color="#3b82f6"
              />
              <MetricCard
                icon={MemoryStick}
                label="RAM"
                value={fmtMb(metrics.memUsedMb)}
                sub={`of ${fmtMb(metrics.memTotalMb)}`}
                percent={metrics.memPercent}
                color="#10b981"
              />
              <DiskCard disk={metrics.rootDisk} label="Disk /" />
              {metrics.dataDisk ? (
                <DiskCard disk={metrics.dataDisk} label="Disk /mnt/data" />
              ) : (
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-2 items-center justify-center">
                  <HardDrive size={20} className="text-[#2a2a2a]" />
                  <span className="text-[#6b7280] text-xs text-center">/mnt/data not mounted</span>
                </div>
              )}
              <MetricCard
                icon={Download}
                label="Net ↓"
                value={`${metrics.network.rxMbps.toFixed(1)} Mbps`}
                sub={metrics.network.interfaceName}
                color="#8b5cf6"
              />
              <MetricCard
                icon={Upload}
                label="Net ↑"
                value={`${metrics.network.txMbps.toFixed(1)} Mbps`}
                sub={metrics.network.interfaceName}
                color="#8b5cf6"
              />
            </div>

            {/* ── Speed Test ── */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void runSpeedTest()}
                disabled={speedTestLoading}
                className="self-start flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] text-[#9ca3af] hover:text-white hover:bg-[#222222] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {speedTestLoading ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Wifi size={13} />
                )}
                {speedTestLoading ? 'Testing…' : 'Test Speed'}
              </button>
              {speedTestResult && !speedTestLoading && (
                <SpeedTestResultBar result={speedTestResult} />
              )}
              {speedTestError && !speedTestLoading && (
                <p className="text-red-400 text-xs">{speedTestError}</p>
              )}
            </div>
          </>
        ) : null}
      </section>

      {/* ── Containers ── */}
      <section className="space-y-3">
        <h2 className="text-[#9ca3af] text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
          <Container size={12} />
          Containers
        </h2>
        {containersLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl h-48 animate-pulse" />
            ))}
          </div>
        ) : containers.length === 0 ? (
          <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-xl">
            No containers found
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {containers.map((c) => (
              <ContainerCard
                key={c.id}
                container={c}
                actionLoading={actionLoading}
                onAction={(id, action) => void containerAction(id, action)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Docker Controls ── */}
      <section className="space-y-3">
        <h2 className="text-[#9ca3af] text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
          <Power size={12} />
          Docker Controls
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => handleSystemAction('restart-all')}
            disabled={actionLoading === 'restart-all'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'restart-all' ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <RotateCcw size={15} />
            )}
            Restart Docker
          </button>
          <button
            onClick={() => handleSystemAction('stop-all')}
            disabled={actionLoading === 'stop-all'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'stop-all' ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Square size={15} />
            )}
            Stop All Containers
          </button>
        </div>
      </section>

      {/* ── Confirm Modal ── */}
      {confirmAction && (
        <ConfirmSystemModal
          action={confirmAction}
          onConfirm={() => void confirmSystemAction()}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/(app)/docker/page.tsx frontend/src/app/(app)/apps/apps.config.ts
git commit -m "feat(docker): rename to System/Containers, add network stats and speed test UI"
```
