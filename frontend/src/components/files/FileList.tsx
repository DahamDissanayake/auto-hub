'use client'
import { Folder, File } from 'lucide-react'
import type { DirEntry } from '@/lib/filesApi'

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
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
        <tr className="text-[#6b7280] text-xs uppercase tracking-wide border-b border-[#2a2a2a]">
          <th className="text-left py-2 px-3 font-medium">Name</th>
          <th className="text-right py-2 px-3 font-medium w-24">Size</th>
          <th className="text-right py-2 px-3 font-medium w-36">Modified</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.name}
            onDoubleClick={() => entry.type === 'dir' && onOpenFolder(entry.name)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry) }}
            className="border-b border-[#1a1a1a] hover:bg-[#111111] cursor-pointer transition-colors group"
          >
            <td className="py-2 px-3">
              <div className="flex items-center gap-2">
                {entry.type === 'dir'
                  ? <Folder size={16} className="text-[#f59e0b] shrink-0" />
                  : <File size={16} className="text-[#6b7280] shrink-0" />
                }
                <span className="text-[#d1d5db] group-hover:text-white truncate">{entry.name}</span>
              </div>
            </td>
            <td className="py-2 px-3 text-right text-[#9ca3af]">{formatSize(entry.size)}</td>
            <td className="py-2 px-3 text-right text-[#9ca3af]">{formatDate(entry.modified)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
