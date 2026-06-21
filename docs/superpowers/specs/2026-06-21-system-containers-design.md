# System/Containers Page — Design Spec
Date: 2026-06-21

## Overview

Rename the "Docker Monitor" page to "System/Containers" and extend the system metrics section with live network bandwidth stats and an on-demand internet speed test button.

---

## 1. Rename

| Location | Old | New |
|---|---|---|
| `frontend/src/app/(app)/apps/apps.config.ts` | `name: 'Docker Monitor'` | `name: 'System/Containers'` |
| `frontend/src/app/(app)/apps/apps.config.ts` | description references Docker Monitor | updated to match new name |
| `frontend/src/app/(app)/docker/page.tsx` | `<h1>Docker Monitor</h1>` | `<h1>System/Containers</h1>` |

URL stays `/docker`. Internal section headings ("System Metrics", "Containers", "Docker Controls") unchanged.

---

## 2. Live Network Stats

### Backend

**New interface** added to `docker.service.ts`:
```ts
interface NetworkStats {
  rxMbps: number
  txMbps: number
  interfaceName: string
}
```

**`SystemMetrics`** gains:
```ts
network: NetworkStats
```

**`getNetworkStats()`** method:
- Reads `/proc/net/dev` twice with a 500ms gap (same pattern as `getCpuPercent`)
- Parses rx_bytes and tx_bytes columns per interface
- Auto-selects primary interface: first non-loopback with traffic, preference order `eth0` → `wlan0` → any other
- Computes `rxMbps = (rxDelta * 8) / 1_000_000 / 0.5`, same for tx
- Returns `{ rxMbps, txMbps, interfaceName }`

**`getSystemMetrics()`** calls `getNetworkStats()` in parallel with the existing CPU/disk calls via `Promise.all`.

### Frontend

**`types.ts`** gains `NetworkStats` interface and `network: NetworkStats` on `SystemMetrics`.

**`docker/page.tsx`** — system metrics grid:
- Layout: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`
- Two new cards appended: **Net ↓** (rxMbps, `Download` lucide icon) and **Net ↑** (txMbps, `Upload` lucide icon)
- `value`: `"X.X Mbps"` formatted to one decimal
- `sub`: interface name (e.g. `"eth0"`)
- Pass `percent={0}` to `MetricCard` — renders an empty bar, signaling no ceiling exists
- Color: `#8b5cf6` (purple) to distinguish from CPU/RAM/disk

---

## 3. Speed Test

### Backend

**New controller endpoint** in `docker.controller.ts`:
```
POST /api/docker/speed-test
```

**`runSpeedTest()`** in `DockerService`:
- Runs `speedtest-cli --json` via `child_process.exec` with a 90s timeout
- Parses stdout JSON, returns:
  ```ts
  { downloadMbps: number, uploadMbps: number, pingMs: number, server: string }
  ```
  where `downloadMbps = bits_per_second / 1_000_000` (from speedtest-cli output fields `download` and `upload`)
- If `speedtest-cli` is not found or exits non-zero, throws with a clear message ("speedtest-cli not installed — run: sudo apt install speedtest-cli")

**`SpeedTestResult`** interface added to `docker.service.ts` and exported.

### Frontend

**`types.ts`** gains:
```ts
export interface SpeedTestResult {
  downloadMbps: number
  uploadMbps: number
  pingMs: number
  server: string
}
```

**`useDockerMonitor.ts`** gains:
- State: `speedTestLoading: boolean`, `speedTestResult: SpeedTestResult | null`, `speedTestError: string | null`
- Function: `runSpeedTest()` — `POST /api/docker/speed-test`, 90s Axios timeout

**`docker/page.tsx`** — below the system metrics grid, a "Test Speed" row:
- Button: spinner + "Testing…" while loading, `Wifi` icon + "Test Speed" at rest
- On success: inline result strip beneath the button:
  ```
  ↓ 94.2 Mbps   ↑ 38.1 Mbps   ⟳ 12 ms   via Colombo, LK
  ```
- On error: small red inline message
- Result persists until next test run or page refresh

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/docker/docker.service.ts` | Add `NetworkStats`, `SpeedTestResult` interfaces; `getNetworkStats()`, `runSpeedTest()` methods; update `SystemMetrics`, `getSystemMetrics()` |
| `backend/src/docker/docker.controller.ts` | Add `POST /speed-test` endpoint |
| `frontend/src/lib/types.ts` | Add `NetworkStats`, `SpeedTestResult`; extend `SystemMetrics` |
| `frontend/src/lib/hooks/useDockerMonitor.ts` | Add speed test state + `runSpeedTest()` |
| `frontend/src/app/(app)/docker/page.tsx` | Rename title, add network cards, add speed test button + result |
| `frontend/src/app/(app)/apps/apps.config.ts` | Rename app entry |
