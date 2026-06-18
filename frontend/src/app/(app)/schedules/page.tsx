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
