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
