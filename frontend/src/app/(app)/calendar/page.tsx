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
          <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">Shortcuts</p>
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
            Shortcut schedules
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
                  {['Name', 'Shortcut', 'Cron', 'Human readable', 'Status', 'Last run', 'Actions'].map(h => (
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
