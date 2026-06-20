'use client'
import { ChevronRight } from 'lucide-react'

const WORKSPACE_LABELS: Record<string, string> = {
  home: 'Home',
  github: 'GitHub Repos',
  'auto-hub': 'Auto-Hub',
}

interface TerminalBreadcrumbProps {
  sessionName: string
  workspace: 'home' | 'github' | 'auto-hub'
  repoName: string | null
  onChangeDir: () => void
}

export function TerminalBreadcrumb({ sessionName, workspace, repoName, onChangeDir }: TerminalBreadcrumbProps) {
  return (
    <div className="h-9 flex items-center justify-between px-3 bg-[#111111] border-b border-[#2a2a2a] shrink-0">
      <div className="flex items-center gap-1 text-xs text-[#6b7280] font-mono overflow-hidden">
        <span className="text-[#10b981] truncate">{sessionName}</span>
        <ChevronRight size={12} className="shrink-0 text-[#3f3f3f]" />
        <span className="truncate">{WORKSPACE_LABELS[workspace] ?? workspace}</span>
        {repoName && (
          <>
            <ChevronRight size={12} className="shrink-0 text-[#3f3f3f]" />
            <span className="text-[#e5e7eb] truncate">{repoName}</span>
          </>
        )}
      </div>
      <button
        onClick={onChangeDir}
        className="text-xs text-[#6b7280] hover:text-[#10b981] transition-colors shrink-0 ml-2"
      >
        Change
      </button>
    </div>
  )
}
