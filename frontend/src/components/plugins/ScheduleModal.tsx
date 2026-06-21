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

type FrequencyType = 'hourly' | 'daily' | 'weekdays' | 'monday' | 'custom'

const FREQUENCIES: { label: string; value: FrequencyType }[] = [
  { label: 'Every hour', value: 'hourly' },
  { label: 'Every day', value: 'daily' },
  { label: 'Weekdays', value: 'weekdays' },
  { label: 'Every Monday', value: 'monday' },
  { label: 'Custom', value: 'custom' },
]

function buildCron(frequency: FrequencyType, time: string, customCron: string): string {
  if (frequency === 'hourly') return '0 * * * *'
  if (frequency === 'custom') return customCron
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr ?? '9', 10)
  const m = parseInt(mStr ?? '0', 10)
  if (frequency === 'daily') return `${m} ${h} * * *`
  if (frequency === 'weekdays') return `${m} ${h} * * 1-5`
  if (frequency === 'monday') return `${m} ${h} * * 1`
  return customCron
}

export default function ScheduleModal({ plugin, isOpen, onClose }: ScheduleModalProps) {
  const [name, setName] = useState(`${plugin.name} schedule`)
  const [frequency, setFrequency] = useState<FrequencyType>('daily')
  const [time, setTime] = useState('09:00')
  const [customCron, setCustomCron] = useState('')
  const createSchedule = useCreateSchedule()
  const toast = useToast()

  const cron = buildCron(frequency, time, customCron)

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
            {FREQUENCIES.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFrequency(f.value)}
                className={`px-3 py-2 text-xs rounded-md border transition-colors text-left ${
                  frequency === f.value
                    ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6]'
                    : 'border-[#2a2a2a] text-[#9ca3af] hover:border-[#3b82f6]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {frequency !== 'hourly' && frequency !== 'custom' && (
          <div>
            <label className="block text-sm text-[#9ca3af] mb-1">At</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-[#f1f1f1] focus:outline-none focus:border-[#3b82f6] [color-scheme:dark]"
            />
          </div>
        )}

        {frequency === 'custom' && (
          <div>
            <label className="block text-sm text-[#9ca3af] mb-1">Cron expression</label>
            <input
              type="text"
              value={customCron}
              onChange={e => setCustomCron(e.target.value)}
              placeholder="0 9 * * *"
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm font-mono text-[#f1f1f1] focus:outline-none focus:border-[#3b82f6]"
              data-testid="cron-input"
            />
          </div>
        )}

        {cron && (
          <p className="text-xs text-[#6b7280]">
            Preview: <span className="text-[#9ca3af]">{cronToHuman(cron)}</span>
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
