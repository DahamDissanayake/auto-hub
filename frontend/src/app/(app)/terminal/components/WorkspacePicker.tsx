'use client'
import { FolderOpen } from 'lucide-react'

interface WorkspacePickerProps {
  onSelect: (workspace: 'home' | 'github') => void
}

export function WorkspacePicker({ onSelect }: WorkspacePickerProps) {
  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen size={18} className="text-[#10b981]" />
          <h2 className="text-white text-sm font-semibold">Select Workspace</h2>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => onSelect('home')}
            className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
          >
            <p className="text-white text-sm font-medium">Data Storage</p>
            <p className="text-[#6b7280] text-xs mt-0.5 font-mono">/mnt/data</p>
          </button>
          <button
            onClick={() => onSelect('github')}
            className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
          >
            <p className="text-white text-sm font-medium">GitHub Repos</p>
            <p className="text-[#6b7280] text-xs mt-0.5 font-mono">/mnt/data/github</p>
          </button>
        </div>
      </div>
    </div>
  )
}
