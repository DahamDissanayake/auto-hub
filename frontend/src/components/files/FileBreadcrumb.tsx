'use client'
import { ChevronRight, HardDrive } from 'lucide-react'

function joinPath(segments: string[]): string {
  return '/' + segments.filter(Boolean).join('/')
}

export default function FileBreadcrumb({
  root,
  path,
  onNavigate,
}: {
  root: string
  path: string
  onNavigate: (path: string) => void
}) {
  const rootLabel: Record<string, string> = {
    internal: 'Internal',
    workspace: 'Workspace',
    data: 'Data Drive',
  }
  const segments = path.split('/').filter(Boolean)

  return (
    <nav className="flex items-center gap-1 text-sm text-[#9ca3af] flex-wrap min-w-0">
      <button
        onClick={() => onNavigate('/')}
        className="flex items-center gap-1 hover:text-white transition-colors shrink-0"
      >
        <HardDrive size={13} className="text-[#f59e0b]" />
        <span>{rootLabel[root] ?? root}</span>
      </button>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1 shrink-0">
          <ChevronRight size={14} className="text-[#4b5563]" />
          <button
            onClick={() => onNavigate(joinPath(segments.slice(0, i + 1)))}
            className="hover:text-white transition-colors max-w-[160px] truncate"
          >
            {seg}
          </button>
        </span>
      ))}
    </nav>
  )
}
