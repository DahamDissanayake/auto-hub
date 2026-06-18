'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
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
