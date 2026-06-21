'use client'
import { ArrowLeft, Maximize2 } from 'lucide-react'
import { TerminalCell } from './TerminalCell'
import type { TabSession } from './SessionTabs'

interface GridViewProps {
  tabs: TabSession[]
  onBack: () => void
  onFocus: (name: string) => void
}

function gridCols(count: number) {
  if (count <= 2) return count
  if (count === 4) return 2
  return Math.min(3, count)
}

function fontSize(count: number) {
  if (count <= 2) return 11
  if (count <= 4) return 9
  return 8
}

export function GridView({ tabs, onBack, onFocus }: GridViewProps) {
  const count = tabs.length
  const cols = gridCols(count)

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 h-10 bg-[#0d0d0d] border-b border-[#2a2a2a] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-white transition-colors"
        >
          <ArrowLeft size={13} />
          <span>Back</span>
        </button>
        <span className="text-[#2a2a2a] select-none">|</span>
        <span className="text-[10px] text-[#4b5563] font-mono">
          {count} session{count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      {count === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[#4b5563] text-sm">
          No open sessions
        </div>
      ) : (
        <div
          className="flex-1 overflow-hidden p-1"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: '4px',
          }}
        >
          {tabs.map(tab => (
            <div
              key={tab.name}
              className="flex flex-col overflow-hidden rounded border border-[#2a2a2a] min-h-0"
            >
              {/* Cell title bar */}
              <div className="flex items-center justify-between px-2 h-6 bg-[#111111] border-b border-[#2a2a2a] shrink-0">
                <span className="text-[10px] text-[#6b7280] font-mono truncate">{tab.name}</span>
                <button
                  onClick={() => onFocus(tab.name)}
                  title="Focus this session"
                  className="text-[#4b5563] hover:text-[#10b981] transition-colors ml-1 shrink-0"
                >
                  <Maximize2 size={9} />
                </button>
              </div>
              {/* Terminal */}
              <div className="flex-1 overflow-hidden min-h-0">
                <TerminalCell sessionName={tab.name} fontSize={fontSize(count)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
