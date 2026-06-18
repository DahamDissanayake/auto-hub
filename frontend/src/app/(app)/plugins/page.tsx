'use client'
import { Puzzle } from 'lucide-react'
import PluginCard from '@/components/plugins/PluginCard'
import { usePlugins } from '@/lib/hooks/usePlugins'

export default function PluginsPage() {
  const { data: plugins, isLoading, error } = usePlugins()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280] text-sm">Loading plugins…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-[#ef4444] text-sm p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg">
        Failed to load plugins.
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <h1 className="text-white text-xl font-semibold flex items-center gap-2">
          <Puzzle size={20} className="text-[#3b82f6]" />
          Plugins
        </h1>
        {plugins && (
          <span className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/30 px-2 py-0.5 rounded-full">
            {plugins.length}
          </span>
        )}
      </div>

      {!plugins || plugins.length === 0 ? (
        <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
          No plugins installed. Drop a plugin folder into the PLUGIN_DIR volume and restart the backend.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plugins.map(plugin => (
            <PluginCard key={plugin.id} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  )
}
