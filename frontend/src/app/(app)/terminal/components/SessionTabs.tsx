'use client'
import { Plus, X } from 'lucide-react'

export interface TabSession {
  name: string
  workspace: 'home' | 'github' | 'auto-hub'
  repoName: string | null
}

interface SessionTabsProps {
  tabs: TabSession[]
  activeTab: string
  onSwitch: (name: string) => void
  onEnd: (name: string) => void
  onNew: () => void
}

export function SessionTabs({ tabs, activeTab, onSwitch, onEnd, onNew }: SessionTabsProps) {
  return (
    <div className="flex items-center gap-0.5 px-2 h-8 bg-[#0d0d0d] border-b border-[#2a2a2a] overflow-x-auto shrink-0">
      {tabs.map(tab => (
        <div
          key={tab.name}
          className={`flex items-center gap-1.5 px-2.5 h-full text-xs font-mono cursor-pointer shrink-0 border-b-2 transition-colors ${
            tab.name === activeTab
              ? 'text-white border-[#10b981]'
              : 'text-[#6b7280] border-transparent hover:text-[#9ca3af]'
          }`}
          onClick={() => onSwitch(tab.name)}
        >
          <span className="max-w-[120px] truncate">{tab.name}</span>
          <button
            onClick={e => { e.stopPropagation(); onEnd(tab.name) }}
            aria-label={`Close ${tab.name}`}
            className="text-[#4b5563] hover:text-[#ef4444] transition-colors ml-0.5"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={onNew}
        aria-label="New or existing session"
        className="flex items-center justify-center w-6 h-6 rounded text-[#6b7280] hover:text-[#10b981] hover:bg-[#1a1a1a] transition-colors shrink-0 ml-0.5"
      >
        <Plus size={12} />
      </button>
    </div>
  )
}
