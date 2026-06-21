'use client'
import { Folder, FileText, Image, Film, Music, FileArchive, File } from 'lucide-react'
import type { DirEntry } from '@/lib/filesApi'

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return Image
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return Film
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return Music
  if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar'].includes(ext)) return FileArchive
  if (['txt', 'md', 'json', 'ts', 'tsx', 'js', 'py', 'sh', 'yaml', 'yml'].includes(ext)) return FileText
  return File
}

export default function FileGrid({
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
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3 p-1">
      {entries.map((entry) => {
        const Icon = entry.type === 'dir' ? Folder : fileIcon(entry.name)
        const color = entry.type === 'dir' ? '#f59e0b' : '#6b7280'
        return (
          <button
            key={entry.name}
            onDoubleClick={() => entry.type === 'dir' && onOpenFolder(entry.name)}
            onClick={() => {}}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry) }}
            className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors group text-center"
          >
            <div className="w-12 h-12 flex items-center justify-center">
              <Icon size={40} style={{ color }} />
            </div>
            <span className="text-[#d1d5db] text-xs leading-tight line-clamp-2 w-full group-hover:text-white break-all">
              {entry.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
