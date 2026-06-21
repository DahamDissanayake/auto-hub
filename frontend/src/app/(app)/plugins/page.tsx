'use client'
import { useState, useMemo } from 'react'
import { Zap, ScrollText } from 'lucide-react'
import PluginCard from '@/components/plugins/PluginCard'
import ExecutionLog from '@/components/plugins/ExecutionLog'
import { usePlugins, useAllExecutions } from '@/lib/hooks/usePlugins'

type Tab = 'shortcuts' | 'output'

const TIME_RANGES = [
  { label: '1h',  hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d',  hours: 168 },
  { label: 'All', hours: null },
] as const

export default function ShortcutsPage() {
  const [tab, setTab] = useState<Tab>('shortcuts')
  const [filterPluginId, setFilterPluginId] = useState<string>('')
  const [timeRange, setTimeRange] = useState<number | null>(24)

  const { data: plugins, isLoading: pluginsLoading, error: pluginsError } = usePlugins()

  const from = useMemo(() => {
    if (!timeRange) return undefined
    return new Date(Date.now() - timeRange * 3_600_000).toISOString()
  }, [timeRange])

  const { data: executions, isLoading: execLoading } = useAllExecutions({
    pluginId: filterPluginId || undefined,
    from,
  })

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-white text-xl font-semibold flex items-center gap-2">
          <Zap size={20} className="text-[#3b82f6]" />
          Shortcuts
        </h1>
        {plugins && (
          <span className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30 px-2 py-0.5 rounded-full">
            {plugins.length}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2a2a] gap-1">
        <button
          onClick={() => setTab('shortcuts')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'shortcuts'
              ? 'border-[#3b82f6] text-[#3b82f6]'
              : 'border-transparent text-[#6b7280] hover:text-[#9ca3af]'
          }`}
        >
          <Zap size={14} />
          Shortcuts
        </button>
        <button
          onClick={() => setTab('output')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'output'
              ? 'border-[#3b82f6] text-[#3b82f6]'
              : 'border-transparent text-[#6b7280] hover:text-[#9ca3af]'
          }`}
        >
          <ScrollText size={14} />
          Output
        </button>
      </div>

      {/* Shortcuts tab */}
      {tab === 'shortcuts' && (
        <>
          {pluginsLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-[#6b7280] text-sm">Loading shortcuts…</div>
            </div>
          )}
          {pluginsError && (
            <div className="text-[#ef4444] text-sm p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg">
              Failed to load shortcuts.
            </div>
          )}
          {!pluginsLoading && !pluginsError && (
            <>
              {!plugins || plugins.length === 0 ? (
                <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
                  No shortcuts installed. Drop a plugin folder into the plugin directory and restart the backend.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plugins.map(plugin => (
                    <PluginCard key={plugin.id} plugin={plugin} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Output tab */}
      {tab === 'output' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={filterPluginId}
              onChange={e => setFilterPluginId(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2a2a2a] text-[#9ca3af] text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-[#3b82f6]"
            >
              <option value="">All shortcuts</option>
              {plugins?.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <div className="flex gap-1">
              {TIME_RANGES.map(r => (
                <button
                  key={r.label}
                  onClick={() => setTimeRange(r.hours)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    timeRange === r.hours
                      ? 'bg-[#3b82f6] text-white'
                      : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#6b7280] hover:text-[#9ca3af] hover:border-[#3b82f6]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {executions && (
              <span className="text-xs text-[#4b5563] ml-auto">
                {executions.length} execution{executions.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Execution list */}
          {execLoading && (
            <div className="flex items-center justify-center h-40">
              <div className="text-[#6b7280] text-sm">Loading…</div>
            </div>
          )}
          {!execLoading && executions?.length === 0 && (
            <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
              No executions found for the selected filters.
            </div>
          )}
          {!execLoading && executions && executions.length > 0 && (
            <div className="space-y-2">
              {executions.map(ex => (
                <ExecutionLog key={ex.id} execution={ex} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
