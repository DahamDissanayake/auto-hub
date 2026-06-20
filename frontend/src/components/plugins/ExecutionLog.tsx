'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { useTimezone } from '@/lib/context/TimezoneContext'
import type { PluginExecution } from '@/lib/types'

function StatusIcon({ status }: { status: PluginExecution['status'] }) {
  if (status === 'success') return <CheckCircle size={14} className="text-[#22c55e] shrink-0" />
  if (status === 'failed') return <XCircle size={14} className="text-[#ef4444] shrink-0" />
  return <Loader2 size={14} className="text-[#3b82f6] animate-spin shrink-0" />
}

export default function ExecutionLog({ execution }: { execution: PluginExecution }) {
  const [expanded, setExpanded] = useState(false)
  const tz = useTimezone()
  const pluginName = execution.plugin?.name ?? execution.pluginId

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#1f1f1f] transition-colors"
      >
        <StatusIcon status={execution.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-medium truncate">{pluginName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#6b7280] shrink-0">
              {execution.triggeredBy}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-[#6b7280]">
            <Clock size={10} />
            <span title={formatInTimeZone(new Date(execution.startedAt), tz, 'PPpp')}>
              {formatDistanceToNow(new Date(execution.startedAt), { addSuffix: true })}
            </span>
            {execution.durationMs != null && (
              <span className="text-[#4b5563]">· {execution.durationMs}ms</span>
            )}
          </div>
        </div>

        {expanded ? (
          <ChevronUp size={14} className="text-[#6b7280] shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[#6b7280] shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[#2a2a2a] px-4 py-3">
          {execution.output ? (
            <pre className="text-xs text-[#9ca3af] whitespace-pre-wrap break-all font-mono leading-relaxed">
              {execution.output}
            </pre>
          ) : (
            <p className="text-xs text-[#4b5563] italic">No output.</p>
          )}
          {execution.error && (
            <p className="mt-2 text-xs text-[#ef4444] font-mono break-all">{execution.error}</p>
          )}
        </div>
      )}
    </div>
  )
}
