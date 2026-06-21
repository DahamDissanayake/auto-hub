'use client'
import { useState } from 'react'
import {
  Play, Settings2, Clock,
  Power, Activity, Globe,
  Server, Wrench, ClipboardList, TrendingUp, DollarSign, Puzzle,
  type LucideIcon,
} from 'lucide-react'
import ConfigModal from './ConfigModal'
import ScheduleModal from './ScheduleModal'
import ActionConfirmModal from './ActionConfirmModal'
import { useRunPlugin } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import { formatDistanceToNow } from 'date-fns'
import type { Plugin, PluginAction } from '@/lib/types'

// Slug-specific icons take priority; category is the fallback
const SLUG_ICONS: Record<string, LucideIcon> = {
  'host-control':  Power,
  'system-health': Activity,
  'webhook-ping':  Globe,
}

const CATEGORY_META: Record<string, { icon: LucideIcon; bg: string; ring: string; fg: string }> = {
  productivity: { icon: ClipboardList, bg: 'bg-[#3b82f6]/12', ring: 'ring-[#3b82f6]/25', fg: 'text-[#3b82f6]' },
  ops:          { icon: Server,        bg: 'bg-[#8b5cf6]/12', ring: 'ring-[#8b5cf6]/25', fg: 'text-[#8b5cf6]' },
  utility:      { icon: Wrench,        bg: 'bg-[#6b7280]/12', ring: 'ring-[#6b7280]/25', fg: 'text-[#9ca3af]' },
  marketing:    { icon: TrendingUp,    bg: 'bg-[#f59e0b]/12', ring: 'ring-[#f59e0b]/25', fg: 'text-[#f59e0b]' },
  finance:      { icon: DollarSign,    bg: 'bg-[#22c55e]/12', ring: 'ring-[#22c55e]/25', fg: 'text-[#22c55e]' },
}
const DEFAULT_META = { icon: Puzzle, bg: 'bg-[#6b7280]/12', ring: 'ring-[#6b7280]/25', fg: 'text-[#9ca3af]' }

function resolveIcon(plugin: Plugin): { Icon: LucideIcon; bg: string; ring: string; fg: string } {
  const meta = CATEGORY_META[plugin.category] ?? DEFAULT_META
  const Icon = SLUG_ICONS[plugin.slug] ?? meta.icon
  return { Icon, bg: meta.bg, ring: meta.ring, fg: meta.fg }
}

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

  const { Icon, bg, ring, fg } = resolveIcon(plugin)

  return (
    <>
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-4 hover:border-[#3b82f6]/40 transition-all hover:shadow-lg hover:shadow-black/20">

        {/* Icon + name */}
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl ${bg} ring-1 ${ring} flex items-center justify-center shrink-0`}>
            <Icon size={20} className={fg} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[#f1f1f1] font-semibold text-sm leading-snug">{plugin.name}</h3>
            <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-medium">
              {plugin.category}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-[#6b7280] text-xs leading-relaxed line-clamp-2 flex-1">
          {plugin.description || 'No description.'}
        </p>

        {/* Last run */}
        <div className="text-[10px] text-[#4b5563]">
          {plugin.lastRunAt ? (
            <>
              Last run:{' '}
              <span className={plugin.lastRunStatus === 'failed' ? 'text-[#ef4444]' : 'text-[#6b7280]'}>
                {formatDistanceToNow(new Date(plugin.lastRunAt), { addSuffix: true })}
              </span>
            </>
          ) : (
            'Never run'
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap pt-3 border-t border-[#2a2a2a]">
          {plugin.actions.length > 0 ? (
            plugin.actions.map(action => (
              <button
                key={action.key}
                onClick={() => setPendingAction(action)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
              data-testid={`run-plugin-${plugin.id}`}
            >
              <Play size={12} />
              {runPlugin.isPending ? 'Running…' : 'Run'}
            </button>
          )}

          {plugin.configSchema.length > 0 && (
            <button
              onClick={() => setConfigOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-lg hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors"
            >
              <Settings2 size={12} />
              Config
            </button>
          )}

          <button
            onClick={() => setScheduleOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-lg hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors ml-auto"
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
