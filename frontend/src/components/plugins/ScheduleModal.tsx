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
