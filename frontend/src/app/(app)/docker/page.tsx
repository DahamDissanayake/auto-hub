'use client'
import { useState } from 'react'
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

// ─── Utility ────────────────────────────────────────────────────────────────

function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function stateColor(state: string): string {
  switch (state) {
    case 'running': return 'text-emerald-400'
    case 'exited': return 'text-red-400'
    case 'paused': return 'text-yellow-400'
    case 'restarting': return 'text-blue-400'
    default: return 'text-[#6b7280]'
  }
}

function healthDot(health: string | null): JSX.Element | null {
  if (!health) return null
  const map: Record<string, string> = {
    healthy: 'bg-emerald-400',
    unhealthy: 'bg-red-400',
    starting: 'bg-yellow-400',
  }
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${map[health] ?? 'bg-[#6b7280]'} flex-shrink-0`}
      title={health}
    />
  )
}

function MiniBar({ percent, color = '#3b82f6' }: { percent: number; color?: string }) {
  return (
    <div className="h-1 w-full bg-[#2a2a2a] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ─── System Metric Card ──────────────────────────────────────────────────────

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

function DiskCard({ disk, label }: { disk: DiskStats; label: string }) {
  const color = disk.percent > 85 ? '#ef4444' : disk.percent > 65 ? '#f59e0b' : '#3b82f6'
  return (
    <MetricCard
      icon={HardDrive}
      label={label}
      value={`${disk.usedGb} GB`}
      sub={`of ${disk.totalGb} GB · ${disk.freeGb} GB free`}
      percent={disk.percent}
      color={color}
    />
  )
}

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

// ─── Container Card ──────────────────────────────────────────────────────────

function ContainerCard({
  container,
  actionLoading,
  onAction,
}: {
  container: ContainerInfo
  actionLoading: string | null
  onAction: (id: string, action: 'restart' | 'stop' | 'start') => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = container.state === 'running'
  const busy = (key: string) => actionLoading === `${key}:${container.id}`

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {healthDot(container.health)}
          <span className="text-white font-medium text-sm truncate">{container.name}</span>
        </div>
        <span className={`text-xs font-medium flex-shrink-0 ${stateColor(container.state)}`}>
          {container.state}
        </span>
      </div>

      {/* Image */}
      <div className="text-[#6b7280] text-xs truncate">{container.image}</div>

      {/* Stats (running only) */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-[#9ca3af]">
            <span>CPU</span>
            <span className="tabular-nums">{container.cpuPercent.toFixed(1)}%</span>
          </div>
          <MiniBar
            percent={container.cpuPercent}
            color={container.cpuPercent > 80 ? '#ef4444' : '#3b82f6'}
          />
          <div className="flex justify-between text-xs text-[#9ca3af] mt-1">
            <span>RAM</span>
            <span className="tabular-nums">
              {fmtMb(container.memUsageMb)}
              {container.memLimitMb > 0 && ` / ${fmtMb(container.memLimitMb)}`}
            </span>
          </div>
          <MiniBar
            percent={container.memPercent || (container.memLimitMb > 0 ? (container.memUsageMb / container.memLimitMb) * 100 : 0)}
            color="#10b981"
          />
        </div>
      )}

      {/* Uptime + expand */}
      {isRunning && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between text-xs text-[#6b7280] hover:text-[#9ca3af] transition-colors"
        >
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {container.uptime}
          </span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}

      {expanded && (
        <div className="text-[10px] text-[#6b7280] bg-[#111111] rounded p-2 font-mono break-all">
          {container.status}
          <br />
          ID: {container.shortId}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {isRunning ? (
          <>
            <ActionBtn
              icon={RotateCcw}
              label="Restart"
              loading={busy('restart')}
              onClick={() => onAction(container.id, 'restart')}
              variant="warn"
            />
            <ActionBtn
              icon={Square}
              label="Stop"
              loading={busy('stop')}
              onClick={() => onAction(container.id, 'stop')}
              variant="danger"
            />
          </>
        ) : (
          <ActionBtn
            icon={Play}
            label="Start"
            loading={busy('start')}
            onClick={() => onAction(container.id, 'start')}
            variant="success"
          />
        )}
      </div>
    </div>
  )
}

function ActionBtn({
  icon: Icon,
  label,
  loading,
  onClick,
  variant,
}: {
  icon: LucideIcon
  label: string
  loading: boolean
  onClick: () => void
  variant: 'warn' | 'danger' | 'success'
}) {
  const colors = {
    warn: 'text-yellow-400 hover:bg-yellow-400/10 border-yellow-400/20',
    danger: 'text-red-400 hover:bg-red-400/10 border-red-400/20',
    success: 'text-emerald-400 hover:bg-emerald-400/10 border-emerald-400/20',
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      {loading ? (
        <RefreshCw size={11} className="animate-spin" />
      ) : (
        <Icon size={11} />
      )}
      {label}
    </button>
  )
}

// ─── Confirm Modal ───────────────────────────────────────────────────────────

function ConfirmSystemModal({
  action,
  onConfirm,
  onCancel,
}: {
  action: 'restart-all' | 'stop-all'
  onConfirm: () => void
  onCancel: () => void
}) {
  const isRestart = action === 'restart-all'
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={isRestart ? 'Restart All Containers?' : 'Stop All Containers?'}
    >
      <div className="space-y-4">
        <p className="text-[#9ca3af] text-sm">
          {isRestart
            ? 'This will restart every running container. Services will be briefly unavailable.'
            : 'This will stop all running containers. You will need to start them again manually.'}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[#9ca3af] hover:text-white border border-[#2a2a2a] rounded-lg hover:bg-[#2a2a2a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isRestart
                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
            }`}
          >
            {isRestart ? 'Yes, Restart All' : 'Yes, Stop All'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

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
