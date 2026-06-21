'use client'
import { ChevronLeft, ChevronRight, HardDrive } from 'lucide-react'

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
    internal:  'Internal',
    workspace: 'Workspace',
    data:      'Data Drive',
  }

  const segments   = path.split('/').filter(Boolean)
  const parentPath = segments.length > 1 ? joinPath(segments.slice(0, -1)) : '/'
  const current    = segments[segments.length - 1]

  return (
    <div className="flex items-center min-w-0 overflow-hidden">

      {/* ── Mobile: back arrow + drive icon + current folder only ── */}
      <div className="flex sm:hidden items-center gap-1 min-w-0 text-xs text-[#9ca3af]">
        {segments.length > 0 ? (
          <>
            <button
              onClick={() => onNavigate(parentPath)}
              className="shrink-0 text-[#6b7280] hover:text-white transition-colors p-0.5 -ml-0.5"
              title="Back"
            >
              <ChevronLeft size={15} />
            </button>
            <HardDrive size={12} className="text-[#f59e0b] shrink-0" />
            <ChevronRight size={11} className="text-[#4b5563] shrink-0" />
            <span className="text-[#d1d5db] truncate font-medium">{current}</span>
          </>
        ) : (
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <HardDrive size={12} className="text-[#f59e0b]" />
            <span className="truncate">{rootLabel[root] ?? root}</span>
          </button>
        )}
      </div>

      {/* ── Desktop: full path, no wrap, clips gracefully ── */}
      <nav className="hidden sm:flex items-center gap-1 text-sm text-[#9ca3af] min-w-0 overflow-hidden">
        <button
          onClick={() => onNavigate('/')}
          className="flex items-center gap-1 hover:text-white transition-colors shrink-0"
        >
          <HardDrive size={13} className="text-[#f59e0b]" />
          <span>{rootLabel[root] ?? root}</span>
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0 min-w-0">
            <ChevronRight size={13} className="text-[#4b5563] shrink-0" />
            <button
              onClick={() => onNavigate(joinPath(segments.slice(0, i + 1)))}
              className="hover:text-white transition-colors max-w-[120px] truncate"
            >
              {seg}
            </button>
          </span>
        ))}
      </nav>

    </div>
  )
}
