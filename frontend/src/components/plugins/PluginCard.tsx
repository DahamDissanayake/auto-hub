'use client'
import { useState } from 'react'
import { Play, Settings2, Clock } from 'lucide-react'
import ConfigModal from './ConfigModal'
import ScheduleModal from './ScheduleModal'
import ActionConfirmModal from './ActionConfirmModal'
import { useRunPlugin } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import { formatDistanceToNow } from 'date-fns'
import type { Plugin, PluginAction } from '@/lib/types'
import {
  ClipboardList, Server, Wrench, TrendingUp, DollarSign, Puzzle,
  type LucideIcon,
} from 'lucide-react'

const categoryMeta: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  productivity: { icon: ClipboardList, bg: 'bg-[#3b82f6]/10', fg: 'text-[#3b82f6]' },
  ops:          { icon: Server,        bg: 'bg-[#8b5cf6]/10', fg: 'text-[#8b5cf6]' },
  utility:      { icon: Wrench,        bg: 'bg-[#6b7280]/10', fg: 'text-[#9ca3af]' },
  marketing:    { icon: TrendingUp,    bg: 'bg-[#f59e0b]/10', fg: 'text-[#f59e0b]' },
  finance:      { icon: DollarSign,    bg: 'bg-[#22c55e]/10', fg: 'text-[#22c55e]' },
}
const defaultMeta = { icon: Puzzle, bg: 'bg-[#6b7280]/10', fg: 'text-[#9ca3af]' }

export default function PluginCard({ plugin }: { plugin: Plugin }) {
  const [configOpen, setConfigOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PluginAction | null>(null)
  const runPlugin = useRunPlugin()
  const toast = useToast()

  const handleRun = async () => {
    try {
      const result = await runPlugin.mutateAsync({ id: plugin.id })
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

  const meta = categoryMeta[plugin.category] ?? defaultMeta
  const CategoryIcon = meta.icon

  return (
    <>
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex flex-col gap-3 hover:border-[#3b82f6]/40 transition-colors">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${meta.bg}`}>
            <CategoryIcon size={16} className={meta.fg} />
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">{plugin.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.fg}`}>
              {plugin.category}
            </span>
          </div>
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
          {plugin.actions.length > 0 ? (
            plugin.actions.map(action => (
              <button
                key={action.key}
                onClick={() => setPendingAction(action)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs text-white rounded-md transition-colors ${
                  action.danger
                    ? 'bg-[#ef4444] hover:bg-[#dc2626]'
                    : 'bg-[#3b82f6] hover:bg-[#2563eb]'
                }`}
              >
                {action.label}
              </button>
            ))
          ) : (
            <button
              onClick={handleRun}
              disabled={runPlugin.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
              data-testid={`run-plugin-${plugin.id}`}
            >
              <Play size={12} />
              {runPlugin.isPending ? 'Running…' : 'Run now'}
            </button>
          )}

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
        </div>
      </div>

      {configOpen && (
        <ConfigModal plugin={plugin} isOpen={configOpen} onClose={() => setConfigOpen(false)} />
      )}
      {scheduleOpen && (
        <ScheduleModal plugin={plugin} isOpen={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      )}
      {pendingAction && (
        <ActionConfirmModal
          pluginId={plugin.id}
          action={pendingAction}
          onClose={() => setPendingAction(null)}
        />
      )}
    </>
  )
}
