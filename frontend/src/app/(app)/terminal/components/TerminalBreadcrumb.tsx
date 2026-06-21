'use client'
import { ChevronRight } from 'lucide-react'
import { ProfileButton } from './ProfileButton'

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
    <div className="h-10 flex items-center justify-between px-3 bg-[#111111] border-b border-[#2a2a2a] shrink-0">
      <div className="flex items-center gap-1 text-xs text-[#6b7280] font-mono overflow-hidden min-w-0">
        <span className="text-[#10b981] shrink-0 max-w-[100px] truncate">{sessionName}</span>
        <ChevronRight size={11} className="shrink-0 text-[#3f3f3f]" />
        <span className="shrink-0">{WORKSPACE_LABELS[workspace] ?? workspace}</span>
        {repoName && (
          <>
            <ChevronRight size={11} className="shrink-0 text-[#3f3f3f]" />
            <span className="text-[#e5e7eb] truncate min-w-0">{repoName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <ProfileButton />
        <button
          onClick={onChangeDir}
          className="text-xs text-[#6b7280] hover:text-[#10b981] active:text-[#10b981] transition-colors px-2 py-1.5"
        >
          Change
        </button>
      </div>
    </div>
  )
}
