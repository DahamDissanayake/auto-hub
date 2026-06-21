'use client'
import { Folder, File, MoreHorizontal } from 'lucide-react'
import type { DirEntry } from '@/lib/filesApi'

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default function FileList({
  entries,
  onOpenFolder,
  onContextMenu,
}: {
  entries: DirEntry[]
  onOpenFolder: (name: string) => void
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void
}) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[#6b7280] text-sm">
        Empty folder
      </div>
    )
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-[#6b7280] text-[10px] uppercase tracking-wide border-b border-[#2a2a2a]">
          <th className="text-left py-2 px-3 font-medium">Name</th>
          {/* Size hidden on mobile */}
          <th className="hidden sm:table-cell text-right py-2 px-3 font-medium w-20">Size</th>
          {/* Modified hidden below md */}
          <th className="hidden md:table-cell text-right py-2 px-3 font-medium w-32">Modified</th>
          {/* Mobile actions column header */}
          <th className="sm:hidden w-10" />
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.name}
            onClick={() => entry.type === 'dir' && onOpenFolder(entry.name)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry) }}
            className="border-b border-[#1a1a1a] hover:bg-[#111111] cursor-pointer transition-colors group"
          >
            <td className="py-2.5 px-3">
              <div className="flex items-center gap-2 min-w-0">
                {entry.type === 'dir'
                  ? <Folder size={15} className="text-[#f59e0b] shrink-0" />
                  : <File   size={15} className="text-[#6b7280] shrink-0" />
                }
                <span className="text-[#d1d5db] group-hover:text-white truncate text-xs">
                  {entry.name}
                </span>
              </div>
            </td>
            <td className="hidden sm:table-cell py-2.5 px-3 text-right text-[#6b7280] text-xs">
              {formatSize(entry.size)}
            </td>
            <td className="hidden md:table-cell py-2.5 px-3 text-right text-[#6b7280] text-xs">
              {formatDate(entry.modified)}
            </td>
            {/* Mobile: visible ⋯ menu button */}
            <td className="sm:hidden py-2 px-1.5 text-right">
              <button
                onClick={(e) => { e.stopPropagation(); onContextMenu(e, entry) }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[#4b5563] hover:text-white hover:bg-[#2a2a2a] active:bg-[#333] transition-colors"
              >
                <MoreHorizontal size={14} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
